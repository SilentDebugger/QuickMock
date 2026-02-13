import fs from 'node:fs/promises';
import path from 'node:path';
import type { RecordedResponse, RouteConfig, JsonValue } from './types.js';
import { parseHar, type ParseResult } from './schema/har.js';

// ── Constants ─────────────────────────────────────

const DATA_DIR = path.resolve('.quickmock');
const MAX_RECORDINGS = 1000;

/** Headers to strip from generated route configs (noisy / sensitive). */
const SKIP_RESPONSE_HEADERS = new Set([
  'transfer-encoding', 'connection', 'keep-alive', 'date', 'server',
  'content-length', 'content-encoding', 'vary', 'x-powered-by',
  'access-control-allow-origin', 'access-control-allow-methods',
  'access-control-allow-headers', 'access-control-max-age',
  'authorization', 'cookie', 'set-cookie', 'x-api-key',
]);

/** Keys that look server-generated (should use faker, not body echo). */
const SERVER_GENERATED = new Set([
  'id', 'created_at', 'createdat', 'updated_at', 'updatedat',
  'created', 'updated', 'modified', 'timestamp',
]);

// ── Paths ─────────────────────────────────────────

function recordingsPath(serverId: string): string {
  return path.join(DATA_DIR, 'servers', `${serverId}.recordings.json`);
}

// ── Recording CRUD ────────────────────────────────

export async function record(serverId: string, entry: RecordedResponse): Promise<void> {
  const recordings = await listRecordings(serverId);
  recordings.push(entry);
  const trimmed = recordings.slice(-MAX_RECORDINGS);
  await fs.mkdir(path.join(DATA_DIR, 'servers'), { recursive: true });
  await fs.writeFile(recordingsPath(serverId), JSON.stringify(trimmed, null, 2) + '\n');
}

export async function listRecordings(serverId: string): Promise<RecordedResponse[]> {
  try {
    const content = await fs.readFile(recordingsPath(serverId), 'utf-8');
    return JSON.parse(content) as RecordedResponse[];
  } catch {
    return [];
  }
}

export async function importRecordings(serverId: string, entries: RecordedResponse[]): Promise<number> {
  const existing = await listRecordings(serverId);
  const merged = [...existing, ...entries].slice(-MAX_RECORDINGS);
  await fs.mkdir(path.join(DATA_DIR, 'servers'), { recursive: true });
  await fs.writeFile(recordingsPath(serverId), JSON.stringify(merged, null, 2) + '\n');
  return entries.length;
}

export async function clearRecordings(serverId: string): Promise<void> {
  try {
    await fs.unlink(recordingsPath(serverId));
  } catch { /* ok if not exists */ }
}

// ── Promote recording to route ────────────────────

export function recordingToRoute(entry: RecordedResponse): RouteConfig {
  // Strip query string from path for route matching
  const routePath = entry.path.split('?')[0];

  let response: JsonValue | undefined = undefined;
  if (entry.body) {
    try { response = JSON.parse(entry.body) as JsonValue; } catch { response = entry.body; }
  }

  // For write methods, build a dynamic template that echoes request body fields
  const isWrite = ['POST', 'PUT', 'PATCH'].includes(entry.method);
  if (isWrite && entry.requestBody && response && typeof response === 'object' && !Array.isArray(response)) {
    try {
      const reqObj = JSON.parse(entry.requestBody) as Record<string, JsonValue>;
      response = buildEchoTemplate(reqObj, response as Record<string, JsonValue>);
    } catch { /* keep original response */ }
  }

  return {
    method: entry.method,
    path: routePath,
    status: entry.status,
    response,
    headers: filterHeaders(entry.responseHeaders ?? {}),
  };
}

// ── Generate routes/resources from recordings ────

/**
 * Analyse all recordings and generate parameterised routes + CRUD resources.
 * Converts recordings to HAR format and delegates to the HAR parser for
 * grouping, CRUD detection, deduplication, and seed template inference.
 */
export function generateFromRecordings(recordings: RecordedResponse[]): ParseResult {
  // Convert recordings into a minimal HAR structure that parseHar() accepts
  const harEntries = recordings
    .filter(r => r.status >= 200)
    .map(r => ({
      request: {
        method: r.method,
        // parseHar expects full URLs; use a dummy origin since paths are already relative
        url: `http://localhost${r.path}`,
        // Pass request body so the parser can build dynamic write-route templates
        ...(r.requestBody ? { postData: { mimeType: 'application/json', text: r.requestBody } } : {}),
      },
      response: {
        status: r.status,
        content: {
          mimeType: 'application/json',
          text: r.body ?? '',
        },
      },
    }));

  const har = { log: { entries: harEntries } };
  return parseHar(har);
}

// ── Helpers ───────────────────────────────────────

/** Remove hop-by-hop, noisy, and auth headers from generated route configs. */
function filterHeaders(headers: Record<string, string>): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (!SKIP_RESPONSE_HEADERS.has(k.toLowerCase())) clean[k] = v;
  }
  return Object.keys(clean).length > 0 ? clean : {};
}

/**
 * Build a dynamic response template for write routes.
 * Keys present in both request and response → `{{body.key}}` (echo input).
 * Keys only in response (server-generated) → `{{faker.*}}` via inferTemplate.
 */
function buildEchoTemplate(
  reqBody: Record<string, JsonValue>,
  resBody: Record<string, JsonValue>,
): Record<string, JsonValue> {
  const template: Record<string, JsonValue> = {};
  for (const [key, val] of Object.entries(resBody)) {
    const lk = key.toLowerCase();
    if (SERVER_GENERATED.has(lk)) {
      // Server-generated field — use faker
      template[key] = inferFaker(val, key);
    } else if (key in reqBody) {
      // Field was in the request — echo it back
      template[key] = `{{body.${key}}}`;
    } else {
      // Field only in response but not server-generated — use faker
      template[key] = inferFaker(val, key);
    }
  }
  return template;
}

/** Quick faker inference for echo template generation. */
function inferFaker(value: JsonValue, key: string): string {
  const lk = key.toLowerCase();
  if (lk === 'id' || lk.endsWith('_id') || (lk.endsWith('id') && lk.length > 2)) return '{{faker.id}}';
  if (lk.includes('email')) return '{{faker.email}}';
  if (lk === 'name' || lk === 'full_name') return '{{faker.name}}';
  if (lk.includes('created') || lk.includes('updated') || lk.endsWith('_at') || lk === 'date') return '{{faker.date}}';
  if (typeof value === 'number') return '{{faker.number}}';
  if (typeof value === 'boolean') return '{{faker.boolean}}';
  return '{{faker.lorem}}';
}
