import crypto from 'node:crypto';
import type { TemplateContext, JsonValue } from './types.js';

// ── Fake data pools ────────────────────────────────

const FIRST = [
  'Emma', 'Liam', 'Olivia', 'Noah', 'Ava', 'Elijah', 'Sophia', 'James',
  'Isabella', 'Oliver', 'Mia', 'Benjamin', 'Charlotte', 'Lucas', 'Amelia',
  'Mason', 'Harper', 'Ethan', 'Evelyn', 'Alexander', 'Luna', 'Daniel',
  'Chloe', 'Henry', 'Aria', 'Sebastian', 'Ella', 'Jack', 'Scarlett', 'Leo',
];

const LAST = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller',
  'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez',
  'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
  'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Clark', 'Lewis', 'Young',
];

const DOMAINS = [
  'gmail.com', 'outlook.com', 'yahoo.com', 'proton.me',
  'example.com', 'test.io', 'company.dev',
];

const COMPANIES = [
  'Acme Corp', 'Globex', 'Initech', 'Hooli', 'Pied Piper',
  'Stark Industries', 'Wayne Enterprises', 'Umbrella Corp',
  'Cyberdyne', 'Tyrell Corp', 'Wonka Inc', 'Aperture Science',
];

const WORDS = [
  'lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing',
  'elit', 'sed', 'do', 'eiusmod', 'tempor', 'incididunt', 'ut', 'labore',
  'et', 'dolore', 'magna', 'aliqua', 'enim', 'minim', 'veniam', 'quis',
  'nostrud', 'exercitation', 'ullamco', 'laboris', 'nisi', 'aliquip',
];

const TITLES = [
  'Getting Started with', 'A Deep Dive into', 'Understanding',
  'The Complete Guide to', 'Why You Should Use', 'Building with',
  'Exploring', 'Mastering', 'Introduction to', 'Advanced',
];

const TOPICS = [
  'React', 'Node.js', 'TypeScript', 'GraphQL', 'Docker', 'Kubernetes',
  'WebSockets', 'REST APIs', 'Microservices', 'Serverless', 'Edge Computing',
  'Machine Learning', 'Web Assembly', 'Rust', 'Deno',
];

// ── Helpers ────────────────────────────────────────

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ── Faker functions ────────────────────────────────

type FakerFn = () => string | number | boolean;

const faker: Record<string, FakerFn> = {
  id:        () => crypto.randomUUID(),
  name:      () => `${pick(FIRST)} ${pick(LAST)}`,
  firstName: () => pick(FIRST),
  lastName:  () => pick(LAST),
  email:     () => `${pick(FIRST).toLowerCase()}.${pick(LAST).toLowerCase()}@${pick(DOMAINS)}`,
  phone:     () => `+1-${randomInt(200, 999)}-${randomInt(100, 999)}-${randomInt(1000, 9999)}`,
  number:    () => randomInt(1, 10000),
  boolean:   () => Math.random() > 0.5,
  date:      () => new Date(Date.now() - randomInt(0, 365 * 24 * 60 * 60 * 1000)).toISOString(),
  timestamp: () => Date.now() - randomInt(0, 365 * 24 * 60 * 60 * 1000),
  company:   () => pick(COMPANIES),
  title:     () => `${pick(TITLES)} ${pick(TOPICS)}`,
  url:       () => `https://${pick(LAST).toLowerCase()}.${pick(['com', 'io', 'dev', 'org'])}`,
  avatar:    () => `https://i.pravatar.cc/150?u=${randomInt(1, 1000)}`,
  color:     () => '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'),
  ip:        () => `${randomInt(1, 255)}.${randomInt(0, 255)}.${randomInt(0, 255)}.${randomInt(1, 255)}`,
  slug:      () => Array.from({ length: 3 }, () => pick(WORDS)).join('-'),

  lorem: () => {
    const count = randomInt(5, 15);
    const words = Array.from({ length: count }, () => pick(WORDS));
    words[0] = words[0][0].toUpperCase() + words[0].slice(1);
    return words.join(' ') + '.';
  },

  paragraph: () => {
    const sentences = randomInt(3, 6);
    return Array.from({ length: sentences }, () => (faker.lorem as () => string)()).join(' ');
  },
};

// ── Template engine ────────────────────────────────

/** Resolve a dotted path like "params.id" or "body.user.name". */
function resolve(obj: unknown, dotPath: string): unknown {
  return dotPath.split('.').reduce<unknown>((acc, key) => {
    if (acc !== null && acc !== undefined && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/** Replace all {{...}} placeholders in a string. */
function processString(str: string, ctx: TemplateContext): string {
  return str.replace(/\{\{(.*?)\}\}/g, (_, expr: string) => {
    const key = expr.trim();

    // faker.xxx
    if (key.startsWith('faker.')) {
      const fn = faker[key.slice(6)];
      if (fn) {
        const val = fn();
        return typeof val === 'object' ? JSON.stringify(val) : String(val);
      }
    }

    // params / body / query / headers
    const val = resolve(ctx, key);
    if (val !== undefined) {
      return typeof val === 'object' ? JSON.stringify(val) : String(val);
    }

    // Unknown — leave as-is
    return `{{${key}}}`;
  });
}

/**
 * Recursively process {{}} templates in any JSON-compatible structure.
 * When a value is a pure template (e.g. "{{faker.number}}"), the
 * result is auto-coerced to the appropriate type.
 */
export function processTemplate(data: JsonValue, ctx: TemplateContext): JsonValue {
  if (typeof data === 'string') {
    const result = processString(data, ctx);

    // Auto-coerce pure-template results back to native types
    if (result === 'true')  return true;
    if (result === 'false') return false;
    if (/^-?\d+$/.test(result))      return parseInt(result, 10);
    if (/^-?\d+\.\d+$/.test(result)) return parseFloat(result);
    return result;
  }

  if (Array.isArray(data)) {
    return data.map(item => processTemplate(item, ctx));
  }

  if (data !== null && typeof data === 'object') {
    const out: Record<string, JsonValue> = {};
    for (const [key, value] of Object.entries(data)) {
      out[processString(key, ctx)] = processTemplate(value, ctx);
    }
    return out;
  }

  // number, boolean, null — pass through
  return data;
}
