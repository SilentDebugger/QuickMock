import crypto from 'node:crypto';
import type { JsonRecord, JsonValue } from './types.js';

// ── Store ─────────────────────────────────────────

export interface StoreListResult {
  items: JsonRecord[];
  total: number;
}

export interface Store {
  seed(name: string, idField: string, items: JsonRecord[]): void;
  list(name: string, filters?: Record<string, string>, limit?: number, offset?: number): StoreListResult;
  get(name: string, id: string): JsonRecord | null;
  create(name: string, data: JsonRecord): JsonRecord;
  update(name: string, id: string, data: JsonRecord): JsonRecord | null;
  patch(name: string, id: string, data: JsonRecord): JsonRecord | null;
  remove(name: string, id: string): boolean;
  reset(): void;
  collections(): string[];
}

interface CollectionMeta {
  idField: string;
  seedData: JsonRecord[];
}

/**
 * Create an in-memory store that manages named collections of JSON records.
 * Each collection is keyed by an ID field and supports full CRUD.
 */
export function createStore(): Store {
  const data = new Map<string, Map<string, JsonRecord>>();
  const meta = new Map<string, CollectionMeta>();

  function getIdValue(item: JsonRecord, idField: string): string {
    const val = item[idField];
    return val !== undefined && val !== null ? String(val) : crypto.randomUUID();
  }

  function seed(name: string, idField: string, items: JsonRecord[]): void {
    meta.set(name, { idField, seedData: items });
    const collection = new Map<string, JsonRecord>();
    for (const item of items) {
      const id = getIdValue(item, idField);
      collection.set(id, { ...item, [idField]: coerceId(id, item[idField]) });
    }
    data.set(name, collection);
  }

  function list(
    name: string,
    filters?: Record<string, string>,
    limit?: number,
    offset?: number,
  ): StoreListResult {
    const collection = data.get(name);
    if (!collection) return { items: [], total: 0 };

    let items = Array.from(collection.values());

    // Apply field filters
    if (filters && Object.keys(filters).length > 0) {
      items = items.filter(item =>
        Object.entries(filters).every(([key, val]) => String(item[key]) === val),
      );
    }

    const total = items.length;

    // Apply pagination
    const start = offset ?? 0;
    if (limit !== undefined) {
      items = items.slice(start, start + limit);
    } else if (start > 0) {
      items = items.slice(start);
    }

    return { items, total };
  }

  function get(name: string, id: string): JsonRecord | null {
    return data.get(name)?.get(id) ?? null;
  }

  function create(name: string, incoming: JsonRecord): JsonRecord {
    const collection = data.get(name);
    if (!collection) throw new Error(`Collection "${name}" not found`);

    const info = meta.get(name)!;
    const idField = info.idField;

    // Auto-generate ID if not provided
    const id = incoming[idField] !== undefined && incoming[idField] !== null
      ? String(incoming[idField])
      : crypto.randomUUID();

    const item: JsonRecord = { ...incoming, [idField]: coerceId(id, incoming[idField]) };
    collection.set(id, item);
    return item;
  }

  function update(name: string, id: string, incoming: JsonRecord): JsonRecord | null {
    const collection = data.get(name);
    if (!collection?.has(id)) return null;

    const info = meta.get(name)!;
    const item: JsonRecord = { ...incoming, [info.idField]: coerceId(id, incoming[info.idField]) };
    collection.set(id, item);
    return item;
  }

  function patch(name: string, id: string, incoming: JsonRecord): JsonRecord | null {
    const collection = data.get(name);
    const existing = collection?.get(id);
    if (!collection || !existing) return null;

    const info = meta.get(name)!;
    const item: JsonRecord = { ...existing, ...incoming, [info.idField]: coerceId(id, existing[info.idField]) };
    collection.set(id, item);
    return item;
  }

  function remove(name: string, id: string): boolean {
    return data.get(name)?.delete(id) ?? false;
  }

  function reset(): void {
    for (const [name, info] of meta.entries()) {
      const collection = new Map<string, JsonRecord>();
      for (const item of info.seedData) {
        const id = getIdValue(item, info.idField);
        collection.set(id, { ...item, [info.idField]: coerceId(id, item[info.idField]) });
      }
      data.set(name, collection);
    }
  }

  function collections(): string[] {
    return Array.from(data.keys());
  }

  return { seed, list, get, create, update, patch, remove, reset, collections };
}

// ── Helpers ───────────────────────────────────────

/** Preserve the original type of the ID value (number vs string). */
function coerceId(id: string, original: JsonValue | undefined): JsonValue {
  if (typeof original === 'number') return Number(id) || id;
  return id;
}
