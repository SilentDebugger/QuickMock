import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { MockServerConfig } from './types.js';

// ── Paths ─────────────────────────────────────────

const DATA_DIR = path.resolve('.quickmock');
const SERVERS_DIR = path.join(DATA_DIR, 'servers');

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

// ── CRUD ──────────────────────────────────────────

export async function listServerConfigs(): Promise<MockServerConfig[]> {
  await ensureDir(SERVERS_DIR);
  const files = await fs.readdir(SERVERS_DIR);
  const configs: MockServerConfig[] = [];
  for (const file of files) {
    // Only match server config files (UUID.json), skip recordings (UUID.recordings.json)
    if (!file.endsWith('.json') || file.includes('.recordings.')) continue;
    try {
      const content = await fs.readFile(path.join(SERVERS_DIR, file), 'utf-8');
      const parsed = JSON.parse(content);
      // Sanity check: must be an object with an id field
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.id) {
        configs.push(parsed as MockServerConfig);
      }
    } catch { /* skip corrupt files */ }
  }
  return configs.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getServerConfig(id: string): Promise<MockServerConfig | null> {
  try {
    const content = await fs.readFile(path.join(SERVERS_DIR, `${id}.json`), 'utf-8');
    return JSON.parse(content) as MockServerConfig;
  } catch {
    return null;
  }
}

export async function saveServerConfig(config: MockServerConfig): Promise<MockServerConfig> {
  await ensureDir(SERVERS_DIR);
  config.updatedAt = Date.now();
  await fs.writeFile(
    path.join(SERVERS_DIR, `${config.id}.json`),
    JSON.stringify(config, null, 2) + '\n',
  );
  return config;
}

export async function deleteServerConfig(id: string): Promise<boolean> {
  try {
    await fs.unlink(path.join(SERVERS_DIR, `${id}.json`));
    return true;
  } catch {
    return false;
  }
}

export function createDefaultConfig(overrides?: Partial<MockServerConfig>): MockServerConfig {
  return {
    id: crypto.randomUUID().slice(0, 8),
    name: 'New Server',
    description: '',
    port: 3001,
    host: 'localhost',
    cors: true,
    delay: 0,
    routes: [],
    resources: {},
    profiles: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}
