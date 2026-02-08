import fs from 'node:fs/promises';
import path from 'node:path';
import type { RecordedResponse, RouteConfig } from './types.js';

// ── Paths ─────────────────────────────────────────

const DATA_DIR = path.resolve('.quickmock');

function recordingsPath(serverId: string): string {
  return path.join(DATA_DIR, 'servers', `${serverId}.recordings.json`);
}

// ── Recording CRUD ────────────────────────────────

export async function record(serverId: string, entry: RecordedResponse): Promise<void> {
  const recordings = await listRecordings(serverId);
  recordings.push(entry);
  // Keep last 500 recordings max
  const trimmed = recordings.slice(-500);
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

export async function clearRecordings(serverId: string): Promise<void> {
  try {
    await fs.unlink(recordingsPath(serverId));
  } catch { /* ok if not exists */ }
}

// ── Promote recording to route ────────────────────

export function recordingToRoute(entry: RecordedResponse): RouteConfig {
  let response = undefined;
  if (entry.body) {
    try {
      response = JSON.parse(entry.body);
    } catch {
      response = entry.body;
    }
  }

  return {
    method: entry.method,
    path: entry.path,
    status: entry.status,
    response,
    headers: filterHeaders(entry.responseHeaders ?? {}),
  };
}

// ── Helpers ───────────────────────────────────────

/** Remove hop-by-hop and noisy headers from recorded response. */
function filterHeaders(headers: Record<string, string>): Record<string, string> {
  const skip = new Set([
    'transfer-encoding', 'connection', 'keep-alive', 'date', 'server',
    'content-length', 'content-encoding', 'vary', 'x-powered-by',
    'access-control-allow-origin', 'access-control-allow-methods',
    'access-control-allow-headers', 'access-control-max-age',
  ]);
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (!skip.has(k.toLowerCase())) clean[k] = v;
  }
  return Object.keys(clean).length > 0 ? clean : {};
}
