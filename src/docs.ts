import type { MockServerConfig, RouteConfig, ResourceConfig, JsonValue } from './types.js';

// ── Faker placeholder descriptions ────────────────

const FAKER_DESC: Record<string, string> = {
  'faker.id':        'UUID string',
  'faker.name':      'Full name',
  'faker.firstName': 'First name',
  'faker.lastName':  'Last name',
  'faker.email':     'Email address',
  'faker.phone':     'Phone number',
  'faker.number':    'Random integer',
  'faker.boolean':   'Boolean',
  'faker.date':      'ISO 8601 date string',
  'faker.timestamp': 'Unix timestamp (number)',
  'faker.company':   'Company name',
  'faker.title':     'Article/post title',
  'faker.url':       'URL string',
  'faker.avatar':    'Avatar image URL',
  'faker.color':     'Hex color string',
  'faker.ip':        'IPv4 address string',
  'faker.slug':      'URL slug string',
  'faker.lorem':     'Random sentence',
  'faker.paragraph': 'Random paragraph',
};

// ── Public API ────────────────────────────────────

export function generateDocs(config: MockServerConfig): string {
  const baseUrl = `http://${config.host}:${config.port}`;
  const lines: string[] = [];

  // Header
  lines.push(`# ${config.name} API`);
  lines.push('');
  if (config.description) {
    lines.push(config.description);
    lines.push('');
  }
  lines.push(`**Base URL:** \`${baseUrl}\``);
  lines.push('');

  // Endpoint summary table
  const allEndpoints = collectEndpoints(config);
  if (allEndpoints.length > 0) {
    lines.push('## Endpoint Summary');
    lines.push('');
    lines.push('| Method | Path | Status | Description |');
    lines.push('|--------|------|--------|-------------|');
    for (const ep of allEndpoints) {
      lines.push(`| \`${ep.method}\` | \`${ep.path}\` | ${ep.status} | ${ep.description} |`);
    }
    lines.push('');
  }

  // Routes
  const routeConfigs = config.routes ?? [];
  if (routeConfigs.length > 0) {
    lines.push('## Routes');
    lines.push('');
    for (let i = 0; i < routeConfigs.length; i++) {
      const r = routeConfigs[i];
      const method = (r.method ?? 'GET').toUpperCase();
      lines.push(`### ${method} ${r.path}`);
      lines.push('');
      lines.push(`**Status:** ${r.status ?? 200}`);
      if (r.delay) lines.push(`  **Delay:** ${r.delay}ms`);
      if (r.error) lines.push(`  **Error rate:** ${Math.round(r.error * 100)}%`);
      lines.push('');

      // Sequence docs
      if (r.sequence && r.sequence.length > 0) {
        lines.push(`**Mode:** Sequence (${r.sequence.length} steps — each request advances to the next)`);
        lines.push('');
        for (let s = 0; s < r.sequence.length; s++) {
          const step = r.sequence[s];
          const tag = step.sticky ? ' (sticky)' : s === r.sequence.length - 1 ? ' (repeats)' : '';
          lines.push(`**Step ${s + 1}${tag}:** status ${step.status ?? r.status ?? 200}${step.delay ? `, delay ${step.delay}ms` : ''}`);
          if (step.response !== undefined && step.response !== null) {
            lines.push('');
            lines.push('```json');
            lines.push(JSON.stringify(step.response, null, 2));
            lines.push('```');
          }
          lines.push('');
        }
      }

      // Rules docs
      else if (r.rules && r.rules.length > 0) {
        lines.push(`**Mode:** Conditional (${r.rules.length} rules — first matching rule wins)`);
        lines.push('');
        for (let ri = 0; ri < r.rules.length; ri++) {
          const rule = r.rules[ri];
          const hasConditions = rule.when && Object.keys(rule.when).length > 0;
          if (hasConditions) {
            const conds = Object.entries(rule.when!).map(([k, v]) => `\`${k}\` = \`${v}\``).join(' AND ');
            lines.push(`**Rule ${ri + 1}:** When ${conds} → status ${rule.status ?? r.status ?? 200}`);
          } else {
            lines.push(`**Default:** status ${rule.status ?? r.status ?? 200}`);
          }
          if (rule.response !== undefined && rule.response !== null) {
            lines.push('');
            lines.push('```json');
            lines.push(JSON.stringify(rule.response, null, 2));
            lines.push('```');
          }
          lines.push('');
        }
      }

      // Single response docs
      else if (r.response !== undefined && r.response !== null) {
        lines.push('**Response:**');
        lines.push('');
        lines.push('```json');
        lines.push(JSON.stringify(r.response, null, 2));
        lines.push('```');
        lines.push('');
        const fields = describeFields(r.response);
        if (fields.length > 0) {
          lines.push('| Field | Type | Description |');
          lines.push('|-------|------|-------------|');
          for (const f of fields) lines.push(`| \`${f.path}\` | ${f.type} | ${f.description} |`);
          lines.push('');
        }
      }

      lines.push('**Example:**');
      lines.push('');
      lines.push('```bash');
      if (method === 'GET' || method === 'DELETE') {
        lines.push(`curl ${baseUrl}${r.path}`);
      } else {
        lines.push(`curl -X ${method} ${baseUrl}${r.path} \\`);
        lines.push(`  -H "Content-Type: application/json" \\`);
        lines.push(`  -d '{}'`);
      }
      lines.push('```');
      lines.push('');
    }
  }

  // Resources
  const resourceEntries = Object.entries(config.resources ?? {});
  if (resourceEntries.length > 0) {
    lines.push('## Resources');
    lines.push('');
    lines.push('Each resource provides full CRUD endpoints with an in-memory data store.');
    lines.push('');
    for (const [name, cfg] of resourceEntries) {
      lines.push(`### ${name}`);
      lines.push('');
      lines.push(`**Base path:** \`${cfg.basePath}\`  `);
      lines.push(`**ID field:** \`${cfg.idField ?? 'id'}\`  `);
      lines.push(`**Seed count:** ${cfg.count ?? 5}`);
      if (cfg.delay) lines.push(`  **Delay:** ${cfg.delay}ms`);
      lines.push('');

      // CRUD endpoints table
      lines.push('| Method | Path | Description |');
      lines.push('|--------|------|-------------|');
      lines.push(`| \`GET\` | \`${cfg.basePath}\` | List all (supports \`?limit=N&offset=N\` and field filters) |`);
      lines.push(`| \`GET\` | \`${cfg.basePath}/:id\` | Get by ID |`);
      lines.push(`| \`POST\` | \`${cfg.basePath}\` | Create new |`);
      lines.push(`| \`PUT\` | \`${cfg.basePath}/:id\` | Full replace |`);
      lines.push(`| \`PATCH\` | \`${cfg.basePath}/:id\` | Partial update |`);
      lines.push(`| \`DELETE\` | \`${cfg.basePath}/:id\` | Delete |`);
      lines.push('');

      // Seed template
      lines.push('**Data shape (seed template):**');
      lines.push('');
      lines.push('```json');
      lines.push(JSON.stringify(cfg.seed, null, 2));
      lines.push('```');
      lines.push('');

      const fields = describeFields(cfg.seed);
      if (fields.length > 0) {
        lines.push('| Field | Type | Description |');
        lines.push('|-------|------|-------------|');
        for (const f of fields) lines.push(`| \`${f.path}\` | ${f.type} | ${f.description} |`);
        lines.push('');
      }

      // Example curls
      lines.push('**Examples:**');
      lines.push('');
      lines.push('```bash');
      lines.push(`# List all`);
      lines.push(`curl ${baseUrl}${cfg.basePath}`);
      lines.push('');
      lines.push(`# Get by ID`);
      lines.push(`curl ${baseUrl}${cfg.basePath}/ITEM_ID`);
      lines.push('');
      lines.push(`# Create`);
      lines.push(`curl -X POST ${baseUrl}${cfg.basePath} \\`);
      lines.push(`  -H "Content-Type: application/json" \\`);
      lines.push(`  -d '${exampleBody(cfg.seed)}'`);
      lines.push('');
      lines.push(`# Paginate`);
      lines.push(`curl "${baseUrl}${cfg.basePath}?limit=10&offset=0"`);
      lines.push('```');
      lines.push('');
    }
  }

  // Special endpoints
  lines.push('## Special Endpoints');
  lines.push('');
  lines.push('| Method | Path | Description |');
  lines.push('|--------|------|-------------|');
  lines.push('| `POST` | `/__reset` | Re-seed all resource collections to initial state |');
  lines.push('');

  return lines.join('\n');
}

// ── Helpers ───────────────────────────────────────

interface EndpointSummary {
  method: string;
  path: string;
  status: number;
  description: string;
}

function collectEndpoints(config: MockServerConfig): EndpointSummary[] {
  const eps: EndpointSummary[] = [];

  for (const r of config.routes ?? []) {
    let description = 'Static route';
    if (r.rules?.length)          description = `${r.rules.length} conditional rules`;
    else if (r.sequence?.length)  description = `${r.sequence.length}-step sequence`;
    else if (r.responses?.length) description = `${r.responses.length} response variants`;
    eps.push({
      method: (r.method ?? 'GET').toUpperCase(),
      path: r.path,
      status: r.status ?? 200,
      description,
    });
  }

  for (const [name, cfg] of Object.entries(config.resources ?? {})) {
    eps.push({ method: 'GET', path: cfg.basePath, status: 200, description: `List ${name}` });
    eps.push({ method: 'GET', path: `${cfg.basePath}/:id`, status: 200, description: `Get ${name} by ID` });
    eps.push({ method: 'POST', path: cfg.basePath, status: 201, description: `Create ${name}` });
    eps.push({ method: 'PUT', path: `${cfg.basePath}/:id`, status: 200, description: `Replace ${name}` });
    eps.push({ method: 'PATCH', path: `${cfg.basePath}/:id`, status: 200, description: `Update ${name}` });
    eps.push({ method: 'DELETE', path: `${cfg.basePath}/:id`, status: 204, description: `Delete ${name}` });
  }

  return eps;
}

interface FieldDesc {
  path: string;
  type: string;
  description: string;
}

function describeFields(value: JsonValue, prefix = ''): FieldDesc[] {
  const fields: FieldDesc[] = [];
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, val] of Object.entries(value)) {
      const fullPath = prefix ? `${prefix}.${key}` : key;
      if (typeof val === 'string' && val.match(/^\{\{(.+?)\}\}$/)) {
        const fakerKey = val.slice(2, -2).trim();
        fields.push({
          path: fullPath,
          type: inferType(val),
          description: FAKER_DESC[fakerKey] ?? fakerKey,
        });
      } else if (val && typeof val === 'object' && !Array.isArray(val)) {
        fields.push({ path: fullPath, type: 'object', description: 'Nested object' });
        fields.push(...describeFields(val, fullPath));
      } else if (Array.isArray(val)) {
        fields.push({ path: fullPath, type: 'array', description: `Array of ${val.length > 0 ? inferType(val[0]) : 'unknown'}` });
      } else if (typeof val === 'string') {
        fields.push({ path: fullPath, type: 'string', description: `Literal: "${val}"` });
      } else if (typeof val === 'number') {
        fields.push({ path: fullPath, type: 'number', description: `Literal: ${val}` });
      } else if (typeof val === 'boolean') {
        fields.push({ path: fullPath, type: 'boolean', description: `Literal: ${val}` });
      } else if (val === null) {
        fields.push({ path: fullPath, type: 'null', description: 'Null' });
      }
    }
  }
  return fields;
}

function inferType(val: JsonValue): string {
  if (typeof val === 'string') {
    const m = val.match(/^\{\{(.+?)\}\}$/);
    if (m) {
      const key = m[1].trim();
      if (key === 'faker.number' || key === 'faker.timestamp') return 'number';
      if (key === 'faker.boolean') return 'boolean';
      return 'string';
    }
    return 'string';
  }
  if (typeof val === 'number') return 'number';
  if (typeof val === 'boolean') return 'boolean';
  if (val === null) return 'null';
  if (Array.isArray(val)) return 'array';
  return 'object';
}

function exampleBody(seed: JsonValue): string {
  if (!seed || typeof seed !== 'object' || Array.isArray(seed)) return '{}';
  const example: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(seed)) {
    if (typeof val === 'string' && val.includes('{{faker.')) continue; // skip generated fields
    if (typeof val === 'string') example[key] = val;
    else if (typeof val === 'number') example[key] = val;
    else if (typeof val === 'boolean') example[key] = val;
  }
  return JSON.stringify(example);
}
