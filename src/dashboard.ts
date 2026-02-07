import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Route, ServerOptions, RuntimeOverride, LogEntry, LogListener, JsonValue } from './types.js';
import type { Store } from './store.js';

// ── Types ─────────────────────────────────────────

export interface ResourceInfo {
  name: string;
  basePath: string;
  idField: string;
  delay?: number;
  error?: number;
  errorStatus?: number;
}

export interface DashboardContext {
  routes: Route[];
  resources: ResourceInfo[];
  options: ServerOptions;
  store: Store;
  routeOverrides: Map<number, RuntimeOverride>;
  resourceOverrides: Map<string, RuntimeOverride>;
  subscribeLog(listener: LogListener): () => void;
}

// ── Static file serving ───────────────────────────

const dashboardDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dashboard');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
};

async function serveStatic(res: http.ServerResponse, pathname: string): Promise<void> {
  const file = pathname === '/__dashboard' || pathname === '/__dashboard/'
    ? 'index.html'
    : pathname.replace(/^\/__dashboard\//, '');

  const ext = path.extname(file) || '.html';
  const filePath = path.join(dashboardDir, file);

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'text/plain' });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
}

// ── API endpoints ─────────────────────────────────

function sendJson(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data, null, 2));
}

function handleApi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  body: JsonValue,
  ctx: DashboardContext,
): void {
  // GET /__api/state
  if (method === 'GET' && pathname === '/__api/state') {
    const state = {
      routes: ctx.routes.map((r, i) => ({
        method: r.method,
        path: r.path,
        status: r.status,
        delay: r.delay,
        error: r.error,
        errorStatus: r.errorStatus,
        index: i,
        override: ctx.routeOverrides.get(i) ?? {},
      })),
      resources: ctx.resources.map(r => ({
        name: r.name,
        basePath: r.basePath,
        idField: r.idField,
        delay: r.delay,
        error: r.error,
        errorStatus: r.errorStatus,
        itemCount: ctx.store.list(r.name).total,
        override: ctx.resourceOverrides.get(r.name) ?? {},
      })),
      options: ctx.options,
    };
    sendJson(res, 200, state);
    return;
  }

  // GET /__api/log (SSE)
  if (method === 'GET' && pathname === '/__api/log') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res.write('\n');

    const unsubscribe = ctx.subscribeLog((entry: LogEntry) => {
      res.write(`data: ${JSON.stringify(entry)}\n\n`);
    });

    req.on('close', unsubscribe);
    return;
  }

  // PATCH /__api/routes/:index
  const routeMatch = pathname.match(/^\/__api\/routes\/(\d+)$/);
  if (method === 'PATCH' && routeMatch) {
    const index = parseInt(routeMatch[1]);
    if (index < 0 || index >= ctx.routes.length) {
      sendJson(res, 404, { error: 'Route not found' });
      return;
    }
    const incoming = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
    const existing = ctx.routeOverrides.get(index) ?? {};
    const override: RuntimeOverride = { ...existing };
    if ('delay' in incoming)    override.delay    = incoming.delay as number | undefined;
    if ('error' in incoming)    override.error    = incoming.error as number | undefined;
    if ('disabled' in incoming) override.disabled = incoming.disabled as boolean | undefined;
    ctx.routeOverrides.set(index, override);
    sendJson(res, 200, { index, override });
    return;
  }

  // PATCH /__api/resources/:name
  const resourceMatch = pathname.match(/^\/__api\/resources\/([^/]+)$/);
  if (method === 'PATCH' && resourceMatch) {
    const name = decodeURIComponent(resourceMatch[1]);
    if (!ctx.resources.some(r => r.name === name)) {
      sendJson(res, 404, { error: 'Resource not found' });
      return;
    }
    const incoming = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
    const existing = ctx.resourceOverrides.get(name) ?? {};
    const override: RuntimeOverride = { ...existing };
    if ('delay' in incoming)    override.delay    = incoming.delay as number | undefined;
    if ('error' in incoming)    override.error    = incoming.error as number | undefined;
    if ('disabled' in incoming) override.disabled = incoming.disabled as boolean | undefined;
    ctx.resourceOverrides.set(name, override);
    sendJson(res, 200, { name, override });
    return;
  }

  sendJson(res, 404, { error: 'Not Found' });
}

// ── Public entry ──────────────────────────────────

/**
 * Handle dashboard and API requests. Returns true if the request was handled.
 */
export async function handleDashboardRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  body: JsonValue,
  ctx: DashboardContext,
): Promise<boolean> {
  if (pathname === '/__dashboard' || pathname.startsWith('/__dashboard/')) {
    await serveStatic(res, pathname);
    return true;
  }

  if (pathname.startsWith('/__api/')) {
    handleApi(req, res, pathname, method, body, ctx);
    return true;
  }

  return false;
}
