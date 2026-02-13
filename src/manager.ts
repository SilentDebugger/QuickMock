import { createMockServer } from './server.js';
import type { MockServer } from './server.js';
import * as project from './project.js';
import * as recorder from './recorder.js';
import type { MockServerConfig, LogListener, LogEntry, RecordedResponse } from './types.js';

/** Header names that carry authentication context. */
const AUTH_HEADER_NAMES = new Set(['authorization', 'cookie', 'x-api-key']);

/** Extract auth-related headers from the most recent recording that has them. */
function extractAuthHeaders(recordings: RecordedResponse[]): Record<string, string> {
  // Walk newest-first
  for (let i = recordings.length - 1; i >= 0; i--) {
    const h = recordings[i].requestHeaders;
    if (!h) continue;
    const auth: Record<string, string> = {};
    for (const [k, v] of Object.entries(h)) {
      if (AUTH_HEADER_NAMES.has(k.toLowerCase())) auth[k] = v;
    }
    if (Object.keys(auth).length > 0) return auth;
  }
  return {};
}

// ── Instance registry ─────────────────────────────

const instances = new Map<string, MockServer>();
const globalLogListeners = new Set<LogListener>();

function emitGlobalLog(entry: LogEntry): void {
  for (const listener of globalLogListeners) listener(entry);
}

export function subscribeGlobalLog(listener: LogListener): () => void {
  globalLogListeners.add(listener);
  return () => globalLogListeners.delete(listener);
}

// ── Instance lifecycle ────────────────────────────

export async function createInstance(config: MockServerConfig): Promise<MockServerConfig> {
  const saved = await project.saveServerConfig(config);
  return saved;
}

export async function startInstance(id: string): Promise<MockServer> {
  if (instances.has(id)) {
    const existing = instances.get(id)!;
    if (existing.running) return existing;
  }

  const config = await project.getServerConfig(id);
  if (!config) throw new Error(`Server "${id}" not found`);

  // Check port conflicts
  for (const [otherId, other] of instances) {
    if (otherId !== id && other.running && other.port === config.port) {
      throw new Error(`Port ${config.port} is already used by server "${otherId}"`);
    }
  }

  const server = createMockServer(config);

  // Forward logs to global listeners
  server.subscribeLog((entry) => emitGlobalLog(entry));

  // Wire up proxy recording if proxyTarget is set
  if (config.proxyTarget) {
    server.onProxyResponse = (entry) => {
      recorder.record(id, entry).catch(() => {});
      // Update auth headers from fresh proxy responses
      const fresh = extractAuthHeaders([entry]);
      if (Object.keys(fresh).length > 0) {
        server.proxyAuthHeaders = { ...server.proxyAuthHeaders, ...fresh };
      }
    };

    // Pre-populate auth headers from existing recordings
    const recordings = await recorder.listRecordings(id);
    if (recordings.length > 0) {
      server.proxyAuthHeaders = extractAuthHeaders(recordings);
    }
  }

  await server.start();
  instances.set(id, server);
  return server;
}

export async function stopInstance(id: string): Promise<void> {
  const server = instances.get(id);
  if (!server) return;
  await server.stop();
  instances.delete(id);
}

export async function deleteInstance(id: string): Promise<boolean> {
  await stopInstance(id);
  return project.deleteServerConfig(id);
}

export function getInstance(id: string): MockServer | undefined {
  return instances.get(id);
}

export function getRunningInstances(): Map<string, MockServer> {
  return instances;
}

export async function reloadInstance(id: string, config: MockServerConfig): Promise<void> {
  const server = instances.get(id);
  if (server && server.running) {
    server.reload(config);
  }
  await project.saveServerConfig(config);
}

// ── Status helpers ────────────────────────────────

export interface ServerStatus {
  config: MockServerConfig;
  running: boolean;
  port: number;
  routeCount: number;
  resourceCount: number;
  resourceItems: Record<string, number>;
}

export async function listServers(): Promise<ServerStatus[]> {
  const configs = await project.listServerConfigs();
  return configs.map(config => {
    const instance = instances.get(config.id);
    const running = instance?.running ?? false;
    return {
      config,
      running,
      port: config.port,
      routeCount: (config.routes ?? []).length,
      resourceCount: Object.keys(config.resources ?? {}).length,
      resourceItems: running
        ? Object.fromEntries(
            instance!.getResources().map(r => [r.name, instance!.getStore().list(r.name).total])
          )
        : {},
    };
  });
}
