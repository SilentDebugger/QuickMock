import type { ResourceConfig } from './types';

// ── Public types ──────────────────────────────────

export interface ScaffoldField {
  name: string;
  faker: string;
  typeHint?: string;
  relation?: string;
}

export interface ScaffoldResource {
  name: string;
  basePath: string;
  count: number;
  fields: ScaffoldField[];
}

export interface ScaffoldResult {
  resources: ScaffoldResource[];
  configs: Record<string, ResourceConfig>;
}

// ── Field name → faker mapping ────────────────────

/** Exact match lookup (normalized: lowercase, no underscores/dashes). */
const EXACT: Record<string, string> = {
  // Identity
  id: 'faker.id', email: 'faker.email', name: 'faker.name',
  firstname: 'faker.firstName', lastname: 'faker.lastName',
  fullname: 'faker.name', displayname: 'faker.name', username: 'faker.name',
  phone: 'faker.phone', phonenumber: 'faker.phone',
  // Media
  avatar: 'faker.avatar', photo: 'faker.avatar', image: 'faker.avatar',
  picture: 'faker.avatar', profileimage: 'faker.avatar',
  url: 'faker.url', link: 'faker.url', website: 'faker.url', homepage: 'faker.url',
  // Text
  title: 'faker.title', headline: 'faker.title', subject: 'faker.title',
  body: 'faker.paragraph', content: 'faker.paragraph', description: 'faker.paragraph',
  bio: 'faker.paragraph', summary: 'faker.paragraph',
  text: 'faker.lorem', message: 'faker.lorem', comment: 'faker.lorem', note: 'faker.lorem',
  slug: 'faker.slug',
  // Misc
  color: 'faker.color', colour: 'faker.color',
  ip: 'faker.ip', ipaddress: 'faker.ip',
  company: 'faker.company', companyname: 'faker.company', organization: 'faker.company',
  // Numbers
  price: 'faker.number', amount: 'faker.number', total: 'faker.number',
  cost: 'faker.number', age: 'faker.number', quantity: 'faker.number',
  count: 'faker.number', rating: 'faker.number', score: 'faker.number',
  salary: 'faker.number', balance: 'faker.number', weight: 'faker.number',
  height: 'faker.number', order: 'faker.number', level: 'faker.number',
  // Booleans
  active: 'faker.boolean', enabled: 'faker.boolean', verified: 'faker.boolean',
  published: 'faker.boolean', visible: 'faker.boolean', admin: 'faker.boolean',
  isadmin: 'faker.boolean', deleted: 'faker.boolean', archived: 'faker.boolean',
  completed: 'faker.boolean', done: 'faker.boolean', ispublic: 'faker.boolean',
  // Dates
  date: 'faker.date', createdat: 'faker.date', updatedat: 'faker.date',
  deletedat: 'faker.date', publishedat: 'faker.date', startdate: 'faker.date',
  enddate: 'faker.date', birthday: 'faker.date', dob: 'faker.date',
  timestamp: 'faker.timestamp',
};

/** Suffix patterns tried after exact match fails. */
const SUFFIXES: [RegExp, string][] = [
  [/(at|date|time)$/i, 'faker.date'],
  [/id$/i,             'faker.id'],
  [/name$/i,           'faker.name'],
  [/email$/i,          'faker.email'],
  [/(url|link)$/i,     'faker.url'],
  [/(image|photo)$/i,  'faker.avatar'],
  [/(count|num)$/i,    'faker.number'],
];

/** Explicit type hint → faker. */
const TYPE_HINTS: Record<string, string> = {
  number: 'faker.number', int: 'faker.number', integer: 'faker.number', float: 'faker.number',
  boolean: 'faker.boolean', bool: 'faker.boolean',
  date: 'faker.date', datetime: 'faker.date', timestamp: 'faker.timestamp',
  email: 'faker.email', url: 'faker.url', avatar: 'faker.avatar', image: 'faker.avatar',
  phone: 'faker.phone', ip: 'faker.ip', color: 'faker.color', company: 'faker.company',
  name: 'faker.name', text: 'faker.paragraph', paragraph: 'faker.paragraph',
  lorem: 'faker.lorem', slug: 'faker.slug', id: 'faker.id', uuid: 'faker.id',
  title: 'faker.title', string: 'faker.lorem',
};

function inferFaker(fieldName: string): string {
  const norm = fieldName.replace(/[-_]/g, '').toLowerCase();
  if (EXACT[norm]) return EXACT[norm];
  for (const [re, faker] of SUFFIXES) {
    if (re.test(norm)) return faker;
  }
  return 'faker.lorem';
}

// ── Parser internals ──────────────────────────────

interface RawField { name: string; typeHint?: string; relation?: string }
interface RawBlock { name: string; count: number; fields: RawField[] }

function parseBlocks(input: string): RawBlock[] {
  const lines = input.split('\n');
  const blocks: RawBlock[] = [];
  let cur: RawBlock | null = null;

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;

    if (/^\s/.test(line)) {
      // Indented → field line belonging to current block
      if (cur) cur.fields.push(...splitFields(line.trim()));
    } else {
      // Resource header: "posts", "posts (20)", "posts: title, body", "posts (20): title, body"
      const m = line.match(/^(\w+)\s*(?:\((\d+)\))?\s*(?::\s*(.+))?$/);
      if (!m) continue;
      cur = { name: m[1], count: m[2] ? parseInt(m[2]) : 5, fields: [] };
      blocks.push(cur);
      if (m[3]) cur.fields.push(...splitFields(m[3]));
    }
  }
  return blocks;
}

function splitFields(text: string): RawField[] {
  return text.split(',').map(s => s.trim()).filter(Boolean).map(tok => {
    // "authorId -> users"
    const rel = tok.match(/^([\w-]+)\s*->\s*(\w+)$/);
    if (rel) return { name: rel[1], relation: rel[2] };
    // "price:number"
    const hint = tok.match(/^([\w-]+):(\w+)$/);
    if (hint) return { name: hint[1], typeHint: hint[2] };
    // Plain field
    return { name: tok.replace(/[^\w-]/g, '') };
  }).filter(f => f.name);
}

function toKebab(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').replace(/[_\s]+/g, '-').toLowerCase();
}

// ── Public API ────────────────────────────────────

export function parseScaffold(input: string): ScaffoldResult {
  const blocks = parseBlocks(input);
  const resources: ScaffoldResource[] = [];
  const configs: Record<string, ResourceConfig> = {};

  for (const block of blocks) {
    const basePath = `/api/${toKebab(block.name)}`;
    const seed: Record<string, unknown> = { id: '{{faker.id}}' };
    const relations: Record<string, { resource: string; field: string }> = {};
    const fields: ScaffoldField[] = [];

    for (const raw of block.fields) {
      if (!raw.name || raw.name === 'id') continue;

      let faker: string;
      if (raw.relation) {
        faker = 'faker.id';
        relations[raw.name] = { resource: raw.relation, field: 'id' };
      } else if (raw.typeHint) {
        faker = TYPE_HINTS[raw.typeHint.toLowerCase()] ?? inferFaker(raw.name);
      } else {
        faker = inferFaker(raw.name);
      }

      seed[raw.name] = `{{${faker}}}`;
      fields.push({ name: raw.name, faker, typeHint: raw.typeHint, relation: raw.relation });
    }

    configs[block.name] = {
      basePath,
      seed,
      count: block.count,
      ...(Object.keys(relations).length > 0 ? { relations } : {}),
    };
    resources.push({ name: block.name, basePath, count: block.count, fields });
  }

  return { resources, configs };
}
