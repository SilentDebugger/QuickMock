import type { RouteConfig, ResourceConfig, JsonValue } from '../types.js';

// ── HAR types (subset we care about) ─────────────

interface HarLog {
  log: {
    entries: HarEntry[];
  };
}

interface HarEntry {
  request: {
    method: string;
    url: string;
    postData?: { mimeType?: string; text?: string };
  };
  response: {
    status: number;
    content: { mimeType?: string; text?: string; size?: number };
    headers?: { name: string; value: string }[];
  };
}

// ── Parse result (same shape as OpenAPI parser) ──

export interface ParseResult {
  routes: { path: string; config: RouteConfig }[];
  resources: { name: string; config: ResourceConfig }[];
}

// ── Helpers ───────────────────────────────────────

/** Segment looks like a UUID or numeric ID. */
function isIdSegment(seg: string): boolean {
  return /^\d+$/.test(seg) || /^[0-9a-f]{8,}$/i.test(seg) || /^[0-9a-f-]{36}$/i.test(seg);
}

/** Convert a concrete URL path to a parameterised pattern: /users/123 → /users/:id */
function parameterise(pathname: string): string {
  return pathname
    .split('/')
    .map(seg => (isIdSegment(seg) ? ':id' : seg))
    .join('/');
}

/** Try to infer a faker template from a JSON value (for resource seed generation). */
function inferTemplate(value: JsonValue, key: string): JsonValue {
  const lk = key.toLowerCase();

  // Name-based heuristics (mirrors sql.ts / openapi.ts mapping)
  if (lk === 'id' || lk.endsWith('_id') || lk.endsWith('id') && lk.length > 2) return '{{faker.id}}';
  if (lk === 'email' || lk.includes('email')) return '{{faker.email}}';
  if (lk === 'name' || lk === 'full_name') return '{{faker.name}}';
  if (lk === 'first_name' || lk === 'firstname') return '{{faker.firstName}}';
  if (lk === 'last_name' || lk === 'lastname') return '{{faker.lastName}}';
  if (lk === 'phone') return '{{faker.phone}}';
  if (lk === 'avatar' || lk === 'image' || lk === 'photo') return '{{faker.avatar}}';
  if (lk === 'url' || lk === 'website') return '{{faker.url}}';
  if (lk === 'title') return '{{faker.title}}';
  if (lk === 'slug') return '{{faker.slug}}';
  if (lk === 'company' || lk === 'organization') return '{{faker.company}}';
  if (lk === 'description' || lk === 'bio' || lk === 'body' || lk === 'content') return '{{faker.paragraph}}';
  if (lk === 'color' || lk === 'colour') return '{{faker.color}}';
  if (lk === 'ip') return '{{faker.ip}}';
  if (lk.includes('created') || lk.includes('updated') || lk.endsWith('_at') || lk === 'date') return '{{faker.date}}';

  // Type-based fallback
  if (typeof value === 'number') return '{{faker.number}}';
  if (typeof value === 'boolean') return '{{faker.boolean}}';
  if (typeof value === 'string') return '{{faker.lorem}}';

  return '{{faker.lorem}}';
}

/** Build a seed template from a sample JSON object. */
function buildSeedTemplate(sample: JsonValue): JsonValue {
  if (sample && typeof sample === 'object' && !Array.isArray(sample)) {
    const template: Record<string, JsonValue> = {};
    for (const [key, val] of Object.entries(sample)) {
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        template[key] = buildSeedTemplate(val);
      } else {
        template[key] = inferTemplate(val, key);
      }
    }
    return template;
  }
  return sample;
}

/** Unwrap paginated / array responses to get a single item sample. */
function unwrapSample(body: JsonValue): JsonValue | null {
  if (Array.isArray(body)) {
    return body.length > 0 ? body[0] : null;
  }
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    // Check common wrapper keys
    const wrapperKeys = ['items', 'data', 'results', 'records', 'rows', 'entries', 'content', 'list'];
    for (const key of wrapperKeys) {
      const val = (body as Record<string, JsonValue>)[key];
      if (Array.isArray(val) && val.length > 0) return val[0];
    }
    // If the object has properties, treat it as a single item
    if (Object.keys(body).length > 0) return body;
  }
  return null;
}

// ── Grouped entry tracking ───────────────────────

interface PathGroup {
  basePath: string;       // e.g. /api/users
  methods: Set<string>;
  hasSingleItem: boolean; // has /:id variant
  sampleResponse: JsonValue | null;
  entries: { method: string; paramPath: string; status: number; response: JsonValue | null }[];
}

// ── Main parser ──────────────────────────────────

/**
 * Parse a HAR file and generate routes/resources.
 * Accepts a HAR JSON string or parsed object.
 * Optionally filter by baseUrl to strip URL prefixes and ignore unrelated requests.
 */
export function parseHar(input: string | object, baseUrl?: string): ParseResult {
  let har: HarLog;
  if (typeof input === 'string') {
    har = JSON.parse(input.trim()) as HarLog;
  } else {
    har = input as HarLog;
  }

  if (!har?.log?.entries) {
    return { routes: [], resources: [] };
  }

  const normalizedBase = baseUrl?.replace(/\/+$/, '') ?? '';

  // ── Step 1: Filter & normalise entries ─────────

  const filtered: { method: string; pathname: string; status: number; body: JsonValue | null }[] = [];

  for (const entry of har.log.entries) {
    const { request, response } = entry;
    const mime = (response.content?.mimeType ?? '').toLowerCase();

    // Only keep JSON responses
    if (!mime.includes('application/json') && !mime.includes('text/json')) continue;

    // Skip non-2xx/3xx/4xx responses that are unlikely useful
    if (response.status < 200) continue;

    let url: URL;
    try { url = new URL(request.url); } catch { continue; }

    let pathname = url.pathname;

    // Apply base URL filter
    if (normalizedBase) {
      const full = `${url.origin}${pathname}`;
      if (!full.startsWith(normalizedBase)) continue;
      pathname = full.slice(normalizedBase.length) || '/';
      if (!pathname.startsWith('/')) pathname = '/' + pathname;
    }

    // Parse response body
    let body: JsonValue | null = null;
    if (response.content?.text) {
      try { body = JSON.parse(response.content.text) as JsonValue; } catch { /* skip */ }
    }

    filtered.push({ method: request.method.toUpperCase(), pathname, status: response.status, body });
  }

  // ── Step 2: Group by parameterised path ────────

  const groups = new Map<string, PathGroup>();

  for (const entry of filtered) {
    const paramPath = parameterise(entry.pathname);
    // Derive base path (strip trailing /:id)
    const basePath = paramPath.replace(/\/:id$/, '') || '/';
    const isDetail = paramPath !== basePath;

    if (!groups.has(basePath)) {
      groups.set(basePath, {
        basePath,
        methods: new Set(),
        hasSingleItem: false,
        sampleResponse: null,
        entries: [],
      });
    }

    const group = groups.get(basePath)!;
    group.methods.add(entry.method);
    if (isDetail) group.hasSingleItem = true;

    // Capture a sample response from GET list or GET detail
    if (entry.method === 'GET' && entry.body !== null && !group.sampleResponse) {
      group.sampleResponse = entry.body;
    }

    group.entries.push({ method: entry.method, paramPath, status: entry.status, response: entry.body });
  }

  // ── Step 3: Classify as resource or route ──────

  const routes: ParseResult['routes'] = [];
  const resources: ParseResult['resources'] = [];
  const resourceBasePaths = new Set<string>();

  for (const [, group] of groups) {
    const { basePath, methods, hasSingleItem, sampleResponse } = group;

    // CRUD resource detection: needs at least GET + one write method, and an /:id variant
    const isResource =
      hasSingleItem &&
      methods.has('GET') &&
      (methods.has('POST') || methods.has('PUT') || methods.has('PATCH') || methods.has('DELETE'));

    if (isResource && sampleResponse) {
      const sample = unwrapSample(sampleResponse);
      if (sample && typeof sample === 'object' && !Array.isArray(sample)) {
        const seed = buildSeedTemplate(sample);
        const seedObj = seed as Record<string, JsonValue>;
        if (!seedObj['id']) seedObj['id'] = '{{faker.id}}';

        const name = basePath.split('/').filter(Boolean).pop() ?? 'items';
        resources.push({
          name,
          config: {
            basePath,
            seed: seedObj,
            count: 5,
            idField: 'id',
          },
        });
        resourceBasePaths.add(basePath);
        continue;
      }
    }

    // Generate individual routes for non-resource entries
    for (const entry of group.entries) {
      // Skip if already covered by a resource
      const entryBase = entry.paramPath.replace(/\/:id$/, '') || '/';
      if (resourceBasePaths.has(entryBase)) continue;

      routes.push({
        path: entry.paramPath,
        config: {
          method: entry.method,
          path: entry.paramPath,
          status: entry.status,
          response: entry.response ?? undefined,
        },
      });
    }
  }

  // Deduplicate routes by method+path (keep first occurrence)
  const seen = new Set<string>();
  const dedupedRoutes = routes.filter(r => {
    const key = `${r.config.method}:${r.config.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { routes: dedupedRoutes, resources };
}
