import { createMockServer } from './server.js';
import type { MockServer } from './server.js';
import * as project from './project.js';
import * as recorder from './recorder.js';
import type { MockServerConfig, LogListener, LogEntry } from './types.js';

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
    };
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
