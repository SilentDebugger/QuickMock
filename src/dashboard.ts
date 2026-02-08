import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as manager from './manager.js';
import * as project from './project.js';
import { parseSqlDdl } from './schema/sql.js';
import { parseOpenApi } from './schema/openapi.js';
import { generateDocs } from './docs.js';
import { generateTypes } from './typegen.js';
import * as recorder from './recorder.js';
import type { MockServerConfig, RuntimeOverride, LogEntry, JsonValue, RouteConfig, ResourceConfig } from './types.js';

// ── Static file serving ───────────────────────────

// Resolve dashboard directory lazily: check build output (dist/dashboard)
// first, then dev location (dashboard-ui/dist).
const __dir = path.dirname(fileURLToPath(import.meta.url));
let _dashboardDir: string | null = null;

async function getDashboardDir(): Promise<string> {
  if (_dashboardDir) return _dashboardDir;
  // Production: dist/dashboard (copied by build script)
  const built = path.join(__dir, 'dashboard');
  try { await fs.access(path.join(built, 'index.html')); _dashboardDir = built; return built; } catch {}
  // Dev: dashboard-ui/dist (Vite build output, relative to project root)
  const dev = path.resolve(__dir, '..', 'dashboard-ui', 'dist');
  try { await fs.access(path.join(dev, 'index.html')); _dashboardDir = dev; return dev; } catch {}
  _dashboardDir = built; // fallback
  return built;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.json': 'application/json',
  '.ico':  'image/x-icon',
};

async function serveStatic(res: http.ServerResponse, pathname: string): Promise<void> {
  // SPA: serve index.html for all /__dashboard paths without extensions
  let file: string;
  if (pathname === '/__dashboard' || pathname === '/__dashboard/') {
    file = 'index.html';
  } else {
    file = pathname.replace(/^\/__dashboard\//, '');
    // If no extension, serve index.html (SPA client-side routing)
    if (!path.extname(file)) file = 'index.html';
  }

  const ext = path.extname(file);
  const dir = await getDashboardDir();
  const filePath = path.join(dir, file);

  try {
    const content = await fs.readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
    res.end(content);
  } catch {
    // Fallback to index.html for SPA routing
    try {
      const index = await fs.readFile(path.join(dir, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(index);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  }
}

// ── Helpers ───────────────────────────────────────

function sendJson(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data, null, 2));
}

function parseBody(req: http.IncomingMessage): Promise<JsonValue> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString();
      try   { resolve(JSON.parse(raw) as JsonValue); }
      catch { resolve(raw || null); }
    });
    req.on('error', () => resolve(null));
  });
}

// ── Route dispatcher ──────────────────────────────

async function handleApi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
): Promise<void> {
  const body = await parseBody(req);

  // ── Servers ─────────────────────────────────

  // GET /__api/servers
  if (method === 'GET' && pathname === '/__api/servers') {
    const servers = await manager.listServers();
    sendJson(res, 200, servers);
    return;
  }

  // POST /__api/servers
  if (method === 'POST' && pathname === '/__api/servers') {
    const incoming = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as Partial<MockServerConfig>;
    const config = project.createDefaultConfig(incoming);
    const saved = await manager.createInstance(config);
    sendJson(res, 201, saved);
    return;
  }

  // Match /__api/servers/:id routes
  const serverMatch = pathname.match(/^\/__api\/servers\/([^/]+)(?:\/(.*))?$/);
  if (serverMatch) {
    const id = decodeURIComponent(serverMatch[1]);
    const sub = serverMatch[2] ?? '';
    await handleServerRoutes(req, res, method, id, sub, body);
    return;
  }

  // ── Schema import ───────────────────────────

  if (method === 'POST' && pathname === '/__api/import/sql') {
    const text = typeof body === 'string' ? body : (body as Record<string, unknown>)?.sql as string ?? '';
    if (!text) { sendJson(res, 400, { error: 'Missing SQL text in body.sql' }); return; }
    const results = parseSqlDdl(text);
    const resources: Record<string, ResourceConfig> = {};
    for (const r of results) resources[r.name] = r.config;
    sendJson(res, 200, { resources, preview: results });
    return;
  }

  if (method === 'POST' && pathname === '/__api/import/openapi') {
    try {
      const spec = typeof body === 'string' ? body : body;
      const result = parseOpenApi(spec as string | object);
      sendJson(res, 200, result);
    } catch (err) {
      sendJson(res, 400, { error: 'Failed to parse OpenAPI spec', message: (err as Error).message });
    }
    return;
  }

  // ── Global log SSE ──────────────────────────

  if (method === 'GET' && pathname === '/__api/log') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res.write('\n');
    const unsubscribe = manager.subscribeGlobalLog((entry: LogEntry) => {
      res.write(`data: ${JSON.stringify(entry)}\n\n`);
    });
    req.on('close', unsubscribe);
    return;
  }

  sendJson(res, 404, { error: 'Not Found' });
}

// ── Per-server routes ─────────────────────────────

async function handleServerRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  id: string,
  sub: string,
  body: JsonValue,
): Promise<void> {

  // GET /__api/servers/:id
  if (method === 'GET' && sub === '') {
    const config = await project.getServerConfig(id);
    if (!config) { sendJson(res, 404, { error: 'Server not found' }); return; }
    const instance = manager.getInstance(id);
    sendJson(res, 200, {
      config,
      running: instance?.running ?? false,
      routeCount: (config.routes ?? []).length,
      resourceCount: Object.keys(config.resources ?? {}).length,
      resourceItems: instance?.running
        ? Object.fromEntries(instance.getResources().map(r => [r.name, instance.getStore().list(r.name).total]))
        : {},
    });
    return;
  }

  // PATCH /__api/servers/:id
  if (method === 'PATCH' && sub === '') {
    const config = await project.getServerConfig(id);
    if (!config) { sendJson(res, 404, { error: 'Server not found' }); return; }
    const incoming = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as Partial<MockServerConfig>;
    const updated: MockServerConfig = { ...config, ...incoming, id: config.id, updatedAt: Date.now() };
    await manager.reloadInstance(id, updated);
    sendJson(res, 200, updated);
    return;
  }

  // DELETE /__api/servers/:id
  if (method === 'DELETE' && sub === '') {
    const ok = await manager.deleteInstance(id);
    if (!ok) { sendJson(res, 404, { error: 'Server not found' }); return; }
    sendJson(res, 200, { deleted: true });
    return;
  }

  // POST /__api/servers/:id/start
  if (method === 'POST' && sub === 'start') {
    try {
      await manager.startInstance(id);
      sendJson(res, 200, { started: true });
    } catch (err) {
      sendJson(res, 400, { error: (err as Error).message });
    }
    return;
  }

  // POST /__api/servers/:id/stop
  if (method === 'POST' && sub === 'stop') {
    await manager.stopInstance(id);
    sendJson(res, 200, { stopped: true });
    return;
  }

  // ── Routes CRUD ─────────────────────────────

  const routeMatch = sub.match(/^routes(?:\/(\d+))?$/);
  if (routeMatch) {
    const config = await project.getServerConfig(id);
    if (!config) { sendJson(res, 404, { error: 'Server not found' }); return; }
    const idx = routeMatch[1] !== undefined ? parseInt(routeMatch[1]) : -1;

    if (method === 'GET' && idx === -1) {
      sendJson(res, 200, config.routes ?? []);
      return;
    }
    if (method === 'POST' && idx === -1) {
      const route = (body && typeof body === 'object' && !Array.isArray(body) ? body : { path: '/' }) as unknown as RouteConfig;
      config.routes = [...(config.routes ?? []), route];
      await manager.reloadInstance(id, config);
      sendJson(res, 201, route);
      return;
    }
    if (method === 'PATCH' && idx >= 0 && idx < (config.routes ?? []).length) {
      const incoming = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as Partial<RouteConfig>;
      config.routes[idx] = { ...config.routes[idx], ...incoming };
      await manager.reloadInstance(id, config);
      sendJson(res, 200, config.routes[idx]);
      return;
    }
    if (method === 'DELETE' && idx >= 0 && idx < (config.routes ?? []).length) {
      config.routes.splice(idx, 1);
      await manager.reloadInstance(id, config);
      sendJson(res, 200, { deleted: true });
      return;
    }
  }

  // ── Resources CRUD ──────────────────────────

  const resourceMatch = sub.match(/^resources(?:\/([^/]+))?$/);
  if (resourceMatch) {
    const config = await project.getServerConfig(id);
    if (!config) { sendJson(res, 404, { error: 'Server not found' }); return; }
    const resName = resourceMatch[1] ? decodeURIComponent(resourceMatch[1]) : undefined;

    if (method === 'GET' && !resName) {
      sendJson(res, 200, config.resources ?? {});
      return;
    }
    if (method === 'POST' && !resName) {
      const incoming = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
      const name = incoming.name as string;
      if (!name) { sendJson(res, 400, { error: 'Missing resource name' }); return; }
      const resCfg = incoming.config as ResourceConfig ?? incoming;
      config.resources = { ...(config.resources ?? {}), [name]: resCfg };
      await manager.reloadInstance(id, config);
      sendJson(res, 201, { name, config: resCfg });
      return;
    }
    if (method === 'PATCH' && resName) {
      if (!config.resources?.[resName]) { sendJson(res, 404, { error: 'Resource not found' }); return; }
      const incoming = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as Partial<ResourceConfig>;
      config.resources[resName] = { ...config.resources[resName], ...incoming };
      await manager.reloadInstance(id, config);
      sendJson(res, 200, config.resources[resName]);
      return;
    }
    if (method === 'DELETE' && resName) {
      if (!config.resources?.[resName]) { sendJson(res, 404, { error: 'Resource not found' }); return; }
      delete config.resources[resName];
      await manager.reloadInstance(id, config);
      sendJson(res, 200, { deleted: true });
      return;
    }
  }

  // ── Profiles ────────────────────────────────

  const profileMatch = sub.match(/^profiles(?:\/([^/]+))?(?:\/activate)?$/);
  if (profileMatch) {
    const config = await project.getServerConfig(id);
    if (!config) { sendJson(res, 404, { error: 'Server not found' }); return; }
    const profName = profileMatch[1] ? decodeURIComponent(profileMatch[1]) : undefined;

    if (method === 'GET' && !profName) {
      sendJson(res, 200, { profiles: config.profiles ?? {}, activeProfile: config.activeProfile });
      return;
    }
    if (method === 'POST' && !profName) {
      const incoming = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
      const name = incoming.name as string;
      if (!name) { sendJson(res, 400, { error: 'Missing profile name' }); return; }
      config.profiles = config.profiles ?? {};
      config.profiles[name] = {
        name,
        description: (incoming.description as string) ?? '',
        disabledRoutes: [],
        disabledResources: [],
        overrides: { routes: {}, resources: {} },
      };
      await project.saveServerConfig(config);
      sendJson(res, 201, config.profiles[name]);
      return;
    }
    if (method === 'PATCH' && profName && !sub.endsWith('/activate')) {
      if (!config.profiles?.[profName]) { sendJson(res, 404, { error: 'Profile not found' }); return; }
      const incoming = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
      config.profiles[profName] = { ...config.profiles[profName], ...incoming, name: profName } as MockServerConfig['profiles'][string];
      await project.saveServerConfig(config);
      sendJson(res, 200, config.profiles[profName]);
      return;
    }
    if (method === 'DELETE' && profName) {
      if (!config.profiles?.[profName]) { sendJson(res, 404, { error: 'Profile not found' }); return; }
      delete config.profiles[profName];
      if (config.activeProfile === profName) config.activeProfile = undefined;
      await project.saveServerConfig(config);
      sendJson(res, 200, { deleted: true });
      return;
    }
    if (method === 'POST' && profName && sub.endsWith('/activate')) {
      if (!config.profiles?.[profName]) { sendJson(res, 404, { error: 'Profile not found' }); return; }
      config.activeProfile = profName;
      // Apply profile overrides to running instance
      const instance = manager.getInstance(id);
      if (instance?.running) {
        const profile = config.profiles[profName];
        instance.routeOverrides.clear();
        instance.resourceOverrides.clear();
        for (const [idx, override] of Object.entries(profile.overrides.routes)) {
          instance.routeOverrides.set(parseInt(idx), override);
        }
        for (const [name, override] of Object.entries(profile.overrides.resources)) {
          instance.resourceOverrides.set(name, override);
        }
        // Mark disabled routes/resources
        for (const idx of profile.disabledRoutes) {
          const existing = instance.routeOverrides.get(idx) ?? {};
          instance.routeOverrides.set(idx, { ...existing, disabled: true });
        }
        for (const name of profile.disabledResources) {
          const existing = instance.resourceOverrides.get(name) ?? {};
          instance.resourceOverrides.set(name, { ...existing, disabled: true });
        }
      }
      await project.saveServerConfig(config);
      sendJson(res, 200, { activated: profName });
      return;
    }
  }

  // ── Runtime overrides ───────────────────────

  const overrideRouteMatch = sub.match(/^overrides\/routes\/(\d+)$/);
  if (method === 'PATCH' && overrideRouteMatch) {
    const instance = manager.getInstance(id);
    if (!instance?.running) { sendJson(res, 400, { error: 'Server is not running' }); return; }
    const idx = parseInt(overrideRouteMatch[1]);
    const incoming = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as Partial<RuntimeOverride>;
    const existing = instance.routeOverrides.get(idx) ?? {};
    instance.routeOverrides.set(idx, { ...existing, ...incoming });
    sendJson(res, 200, { index: idx, override: instance.routeOverrides.get(idx) });
    return;
  }

  const overrideResourceMatch = sub.match(/^overrides\/resources\/([^/]+)$/);
  if (method === 'PATCH' && overrideResourceMatch) {
    const instance = manager.getInstance(id);
    if (!instance?.running) { sendJson(res, 400, { error: 'Server is not running' }); return; }
    const name = decodeURIComponent(overrideResourceMatch[1]);
    const incoming = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as Partial<RuntimeOverride>;
    const existing = instance.resourceOverrides.get(name) ?? {};
    instance.resourceOverrides.set(name, { ...existing, ...incoming });
    sendJson(res, 200, { name, override: instance.resourceOverrides.get(name) });
    return;
  }

  // ── Docs (markdown) ─────────────────────────

  if (method === 'GET' && sub === 'docs') {
    const config = await project.getServerConfig(id);
    if (!config) { sendJson(res, 404, { error: 'Server not found' }); return; }
    const md = generateDocs(config);
    res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
    res.end(md);
    return;
  }

  // ── TypeScript types ───────────────────────

  if (method === 'GET' && sub === 'types') {
    const config = await project.getServerConfig(id);
    if (!config) { sendJson(res, 404, { error: 'Server not found' }); return; }
    const ts = generateTypes(config);
    res.writeHead(200, { 'Content-Type': 'text/typescript; charset=utf-8' });
    res.end(ts);
    return;
  }

  // ── Export config ──────────────────────────

  if (method === 'GET' && sub === 'export') {
    const config = await project.getServerConfig(id);
    if (!config) { sendJson(res, 404, { error: 'Server not found' }); return; }
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${config.name.replace(/[^a-z0-9]/gi, '_')}.json"`,
    });
    res.end(JSON.stringify(config, null, 2));
    return;
  }

  // ── Recordings ─────────────────────────────

  const recordingMatch = sub.match(/^recordings(?:\/(\d+)\/promote)?$/);
  if (recordingMatch) {
    // GET /__api/servers/:id/recordings
    if (method === 'GET' && !recordingMatch[1]) {
      const recordings = await recorder.listRecordings(id);
      sendJson(res, 200, recordings);
      return;
    }
    // DELETE /__api/servers/:id/recordings
    if (method === 'DELETE' && !recordingMatch[1]) {
      await recorder.clearRecordings(id);
      sendJson(res, 200, { cleared: true });
      return;
    }
    // POST /__api/servers/:id/recordings/:idx/promote
    if (method === 'POST' && recordingMatch[1]) {
      const idx = parseInt(recordingMatch[1]);
      const recordings = await recorder.listRecordings(id);
      if (idx < 0 || idx >= recordings.length) { sendJson(res, 404, { error: 'Recording not found' }); return; }
      const route = recorder.recordingToRoute(recordings[idx]);
      const config = await project.getServerConfig(id);
      if (!config) { sendJson(res, 404, { error: 'Server not found' }); return; }
      config.routes = [...(config.routes ?? []), route];
      await manager.reloadInstance(id, config);
      sendJson(res, 201, route);
      return;
    }
  }

  // ── Per-server log SSE ──────────────────────

  if (method === 'GET' && sub === 'log') {
    const instance = manager.getInstance(id);
    if (!instance) { sendJson(res, 404, { error: 'Server not found or not running' }); return; }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res.write('\n');
    const unsubscribe = instance.subscribeLog((entry: LogEntry) => {
      res.write(`data: ${JSON.stringify(entry)}\n\n`);
    });
    req.on('close', unsubscribe);
    return;
  }

  sendJson(res, 404, { error: 'Not Found' });
}

// ── Public: management server ─────────────────────

export function createManagementServer(port: number, host: string): http.Server {
  const server = http.createServer(async (req, res) => {
    const method = req.method!.toUpperCase();
    const pathname = new URL(req.url!, `http://${req.headers.host}`).pathname;

    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
    if (method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    try {
      // API routes
      if (pathname.startsWith('/__api/')) {
        await handleApi(req, res, pathname, method);
        return;
      }

      // Dashboard (SPA)
      if (pathname === '/' || pathname.startsWith('/__dashboard')) {
        // Redirect root to dashboard
        if (pathname === '/') {
          res.writeHead(302, { Location: '/__dashboard' });
          res.end();
          return;
        }
        await serveStatic(res, pathname);
        return;
      }

      // Also serve dashboard assets from /assets/* (Vite build output)
      if (pathname.startsWith('/assets/')) {
        await serveStatic(res, '/__dashboard' + pathname);
        return;
      }

      // Fallback to dashboard for SPA
      await serveStatic(res, '/__dashboard');
    } catch (err) {
      if (!res.headersSent) {
        sendJson(res, 500, { error: 'Internal Server Error', message: (err as Error).message });
      }
    }
  });

  return server;
}
