import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import { processTemplate } from './template.js';
import { watchFile } from './watcher.js';
import { createStore } from './store.js';
import type { Store } from './store.js';
import type {
  Route, RouteConfig, ResourceConfig, ResourceEntry, RoutesFileConfig,
  MockServerConfig, ServerOptions, TemplateContext,
  JsonValue, JsonRecord, LogEntry, LogListener, RuntimeOverride, RecordedResponse,
} from './types.js';

// ── Color palette ──────────────────────────────────

const c = {
  brand:   chalk.bold.hex('#F472B6'),
  success: chalk.hex('#10B981'),
  warn:    chalk.hex('#F59E0B'),
  error:   chalk.hex('#EF4444'),
  dim:     chalk.hex('#6B7280'),
  path:    chalk.hex('#D1D5DB'),
  time:    chalk.hex('#06B6D4'),
  method: {
    GET:     chalk.bold.hex('#10B981'),
    POST:    chalk.bold.hex('#3B82F6'),
    PUT:     chalk.bold.hex('#F59E0B'),
    PATCH:   chalk.bold.hex('#8B5CF6'),
    DELETE:  chalk.bold.hex('#EF4444'),
    OPTIONS: chalk.hex('#6B7280'),
    HEAD:    chalk.hex('#6B7280'),
  } as Record<string, typeof chalk>,
  status(code: number): string {
    if (code < 300) return chalk.hex('#10B981')(String(code));
    if (code < 400) return chalk.hex('#F59E0B')(String(code));
    return chalk.hex('#EF4444')(String(code));
  },
};

// ── Shared helpers ────────────────────────────────

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

function parseQuery(url: string): Record<string, string> {
  const idx = url.indexOf('?');
  if (idx === -1) return {};
  return Object.fromEntries(new URLSearchParams(url.slice(idx)).entries());
}

/** Empty template context used for seed generation. */
const EMPTY_CTX: TemplateContext = {
  params: {},
  body: null,
  query: {},
  headers: {},
};

function parseRouteConfigs(raw: RouteConfig[]): Route[] {
  return raw.map((r): Route => ({
    method:      (r.method || 'GET').toUpperCase(),
    path:        r.path,
    status:      r.status || 200,
    response:    r.response,
    responses:   r.responses,
    headers:     r.headers || {},
    delay:       r.delay,
    error:       r.error,
    errorStatus: r.errorStatus,
  }));
}

function seedResources(
  resourceDefs: Record<string, ResourceConfig>,
  store: Store,
): ResourceEntry[] {
  const entries: ResourceEntry[] = [];
  for (const [name, cfg] of Object.entries(resourceDefs)) {
    const idField = cfg.idField ?? 'id';
    const count   = cfg.count ?? 5;
    const seedItems: JsonRecord[] = [];
    for (let i = 0; i < count; i++) {
      const processed = processTemplate(cfg.seed, EMPTY_CTX);
      if (processed && typeof processed === 'object' && !Array.isArray(processed)) {
        seedItems.push(processed as JsonRecord);
      }
    }
    store.seed(name, idField, seedItems);
    entries.push({
      name,
      basePath: cfg.basePath,
      idField,
      delay: cfg.delay,
      error: cfg.error,
      errorStatus: cfg.errorStatus,
    });
  }
  return entries;
}

// ── MockServer interface ──────────────────────────

export interface MockServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  reload(config: MockServerConfig): void;
  getRoutes(): Route[];
  getResources(): ResourceEntry[];
  getStore(): Store;
  getConfig(): MockServerConfig;
  routeOverrides: Map<number, RuntimeOverride>;
  resourceOverrides: Map<string, RuntimeOverride>;
  subscribeLog(listener: LogListener): () => void;
  onProxyResponse: ((entry: RecordedResponse) => void) | null;
  readonly running: boolean;
  readonly port: number;
  readonly host: string;
}

// ── Factory ───────────────────────────────────────

export function createMockServer(config: MockServerConfig): MockServer {
  let routes: Route[] = [];
  let resources: ResourceEntry[] = [];
  const store: Store = createStore();
  const routeOverrides    = new Map<number, RuntimeOverride>();
  const resourceOverrides = new Map<string, RuntimeOverride>();
  const logListeners      = new Set<LogListener>();
  let httpServer: http.Server | null = null;
  let _running = false;
  let currentConfig = config;
  let onProxyResponse: ((entry: RecordedResponse) => void) | null = null;

  // ── Apply config ──────────────────────────────

  function applyConfig(cfg: MockServerConfig): void {
    currentConfig = cfg;
    routes = parseRouteConfigs(cfg.routes ?? []);
    resources = seedResources(cfg.resources ?? {}, store);
  }

  // ── Route matching ────────────────────────────

  interface RouteMatch { route: Route; params: Record<string, string>; }

  function matchRoute(method: string, pathname: string): RouteMatch | null {
    for (const route of routes) {
      if (route.method !== method && route.method !== '*') continue;
      const rSegs = route.path.split('/').filter(Boolean);
      const pSegs = pathname.split('/').filter(Boolean);
      if (rSegs.length !== pSegs.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let i = 0; i < rSegs.length; i++) {
        if (rSegs[i].startsWith(':')) {
          params[rSegs[i].slice(1)] = decodeURIComponent(pSegs[i]);
        } else if (rSegs[i] !== pSegs[i]) {
          ok = false;
          break;
        }
      }
      if (ok) return { route, params };
    }
    return null;
  }

  // ── Resource matching ─────────────────────────

  interface ResourceMatch { resource: ResourceEntry; id?: string; }

  function matchResource(method: string, pathname: string): ResourceMatch | null {
    for (const resource of resources) {
      const base = resource.basePath.replace(/\/+$/, '');
      const baseSegs = base.split('/').filter(Boolean);
      const pathSegs = pathname.replace(/\/+$/, '').split('/').filter(Boolean);

      if (pathSegs.length === baseSegs.length) {
        if (baseSegs.every((seg, i) => seg === pathSegs[i]) && (method === 'GET' || method === 'POST')) {
          return { resource };
        }
      }
      if (pathSegs.length === baseSegs.length + 1) {
        if (baseSegs.every((seg, i) => seg === pathSegs[i]) && ['GET', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
          return { resource, id: decodeURIComponent(pathSegs[pathSegs.length - 1]) };
        }
      }
    }
    return null;
  }

  // ── Resource CRUD ─────────────────────────────

  function handleResourceCrud(
    method: string,
    match: ResourceMatch,
    body: JsonValue,
    query: Record<string, string>,
  ): { status: number; data: JsonValue; headers?: Record<string, string> } {
    const { resource, id } = match;

    if (method === 'GET' && !id) {
      const { limit, offset, ...filters } = query;
      const result = store.list(resource.name, filters,
        limit !== undefined ? parseInt(limit) : undefined,
        offset !== undefined ? parseInt(offset) : undefined);
      return { status: 200, data: result.items as JsonValue, headers: { 'X-Total-Count': String(result.total) } };
    }
    if (method === 'GET' && id) {
      const item = store.get(resource.name, id);
      if (!item) return { status: 404, data: { error: 'Not Found', message: `${resource.name} "${id}" not found` } };
      return { status: 200, data: item as JsonValue };
    }
    if (method === 'POST') {
      const incoming = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as JsonRecord;
      return { status: 201, data: store.create(resource.name, incoming) as JsonValue };
    }
    if (method === 'PUT' && id) {
      const incoming = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as JsonRecord;
      const item = store.update(resource.name, id, incoming);
      if (!item) return { status: 404, data: { error: 'Not Found', message: `${resource.name} "${id}" not found` } };
      return { status: 200, data: item as JsonValue };
    }
    if (method === 'PATCH' && id) {
      const incoming = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as JsonRecord;
      const item = store.patch(resource.name, id, incoming);
      if (!item) return { status: 404, data: { error: 'Not Found', message: `${resource.name} "${id}" not found` } };
      return { status: 200, data: item as JsonValue };
    }
    if (method === 'DELETE' && id) {
      const removed = store.remove(resource.name, id);
      if (!removed) return { status: 404, data: { error: 'Not Found', message: `${resource.name} "${id}" not found` } };
      return { status: 204, data: null };
    }
    return { status: 405, data: { error: 'Method Not Allowed' } };
  }

  // ── Logging ───────────────────────────────────

  function emitLog(entry: LogEntry): void {
    for (const listener of logListeners) listener(entry);
  }

  function logRequest(method: string, pathname: string, status: number, ms: number): void {
    const mFn  = c.method[method] ?? c.dim;
    const mStr = mFn(method.padEnd(7));
    console.log(`  ${mStr} ${c.path(pathname)}  ${c.dim('→')}  ${c.status(status)}  ${c.dim('in')} ${c.time(ms + 'ms')}`);
    emitLog({ method, path: pathname, status, ms, timestamp: Date.now(), serverId: currentConfig.id });
  }

  // ── Request handler ───────────────────────────

  async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const start = Date.now();
    const method = req.method!.toUpperCase();
    const pathname = new URL(req.url!, `http://${req.headers.host}`).pathname;

    // CORS
    if (currentConfig.cors) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With');
      res.setHeader('Access-Control-Max-Age', '86400');
      if (method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        logRequest(method, pathname, 204, Date.now() - start);
        return;
      }
    }

    // Reset endpoint
    if (method === 'POST' && pathname === '/__reset') {
      store.reset();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'All collections re-seeded' }));
      logRequest(method, pathname, 200, Date.now() - start);
      return;
    }

    // Custom routes
    const match = matchRoute(method, pathname);
    if (match) {
      const { route, params } = match;
      const routeIdx = routes.indexOf(route);
      const override = routeOverrides.get(routeIdx);

      if (override?.disabled) {
        const body = JSON.stringify({ error: 'Service Unavailable', message: 'Endpoint temporarily disabled' });
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(body);
        logRequest(method, pathname, 503, Date.now() - start);
        return;
      }

      const delay = override?.delay ?? route.delay ?? currentConfig.delay ?? 0;
      if (delay > 0) await new Promise<void>((r) => setTimeout(r, delay));

      const errorRate = override?.error ?? route.error ?? 0;
      if (errorRate > 0 && Math.random() < errorRate) {
        const errStatus = route.errorStatus || 500;
        res.writeHead(errStatus, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: http.STATUS_CODES[errStatus] || 'Error', message: 'Simulated failure' }));
        logRequest(method, pathname, errStatus, Date.now() - start);
        return;
      }

      const reqBody = await parseBody(req);
      const query   = parseQuery(req.url!);
      const ctx: TemplateContext = { params, body: reqBody, query, headers: req.headers };

      let responseData: JsonValue | undefined = route.response;
      if (route.responses && route.responses.length > 0) {
        responseData = route.responses[Math.floor(Math.random() * route.responses.length)];
      }
      if (responseData !== undefined && responseData !== null) {
        responseData = processTemplate(responseData, ctx);
      }

      const status  = route.status || 200;
      const headers = { 'Content-Type': 'application/json', ...route.headers };
      res.writeHead(status, headers);
      if (responseData !== undefined && responseData !== null) {
        res.end(typeof responseData === 'string' ? responseData : JSON.stringify(responseData, null, 2));
      } else {
        res.end();
      }
      logRequest(method, pathname, status, Date.now() - start);
      return;
    }

    // Resource routes
    const resourceMatch = matchResource(method, pathname);
    if (resourceMatch) {
      const { resource } = resourceMatch;
      const override = resourceOverrides.get(resource.name);

      if (override?.disabled) {
        const body = JSON.stringify({ error: 'Service Unavailable', message: 'Resource temporarily disabled' });
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(body);
        logRequest(method, pathname, 503, Date.now() - start);
        return;
      }

      const delay = override?.delay ?? resource.delay ?? currentConfig.delay ?? 0;
      if (delay > 0) await new Promise<void>((r) => setTimeout(r, delay));

      const errorRate = override?.error ?? resource.error ?? 0;
      if (errorRate > 0 && Math.random() < errorRate) {
        const errStatus = resource.errorStatus || 500;
        res.writeHead(errStatus, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: http.STATUS_CODES[errStatus] || 'Error', message: 'Simulated failure' }));
        logRequest(method, pathname, errStatus, Date.now() - start);
        return;
      }

      const reqBody = await parseBody(req);
      const query   = parseQuery(req.url!);
      const result  = handleResourceCrud(method, resourceMatch, reqBody, query);
      const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(result.headers ?? {}) };
      res.writeHead(result.status, headers);
      if (result.data !== null && result.data !== undefined) {
        res.end(JSON.stringify(result.data, null, 2));
      } else {
        res.end();
      }
      logRequest(method, pathname, result.status, Date.now() - start);
      return;
    }

    // Proxy: forward unmatched requests to real API if proxyTarget is set
    if (currentConfig.proxyTarget) {
      try {
        const targetUrl = currentConfig.proxyTarget.replace(/\/+$/, '') + pathname;
        const reqBody = method !== 'GET' && method !== 'HEAD' ? await parseBody(req) : undefined;

        const proxyRes = await fetch(targetUrl, {
          method,
          headers: {
            ...Object.fromEntries(
              Object.entries(req.headers)
                .filter(([k]) => !['host', 'connection'].includes(k))
                .map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : v ?? '']),
            ),
          },
          body: reqBody !== undefined && reqBody !== null ? JSON.stringify(reqBody) : undefined,
        });

        const proxyBody = await proxyRes.text();
        const proxyStatus = proxyRes.status;

        // Collect response headers
        const respHeaders: Record<string, string> = {};
        proxyRes.headers.forEach((val, key) => { respHeaders[key] = val; });

        // Record the response for later promotion
        onProxyResponse?.({
          method,
          path: pathname,
          status: proxyStatus,
          responseHeaders: respHeaders,
          body: proxyBody,
          timestamp: Date.now(),
        });

        // Pipe response back to client
        const outHeaders: Record<string, string> = { ...respHeaders };
        delete outHeaders['transfer-encoding'];
        delete outHeaders['content-encoding'];
        delete outHeaders['content-length'];
        res.writeHead(proxyStatus, outHeaders);
        res.end(proxyBody);
        logRequest(method, pathname, proxyStatus, Date.now() - start);
        return;
      } catch (err) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Bad Gateway', message: `Proxy failed: ${(err as Error).message}` }));
        logRequest(method, pathname, 502, Date.now() - start);
        return;
      }
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found', message: `No mock for ${method} ${pathname}` }));
    logRequest(method, pathname, 404, Date.now() - start);
  }

  // ── Lifecycle ─────────────────────────────────

  applyConfig(config);

  function subscribeLog(listener: LogListener): () => void {
    logListeners.add(listener);
    return () => logListeners.delete(listener);
  }

  async function start(): Promise<void> {
    if (_running) return;
    httpServer = http.createServer((req, res) => {
      handleRequest(req, res).catch((err: unknown) => {
        console.error(`  ${c.error('Error:')} ${(err as Error).message}`);
        if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal Server Error' }));
      });
    });

    await new Promise<void>((resolve, reject) => {
      httpServer!.listen(currentConfig.port, currentConfig.host, () => resolve());
      httpServer!.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') reject(new Error(`Port ${currentConfig.port} is already in use`));
        else reject(err);
      });
    });
    _running = true;
  }

  async function stop(): Promise<void> {
    if (!_running || !httpServer) return;
    await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
    httpServer = null;
    _running = false;
  }

  function reload(newConfig: MockServerConfig): void {
    applyConfig(newConfig);
    routeOverrides.clear();
    resourceOverrides.clear();
  }

  return {
    start,
    stop,
    reload,
    getRoutes:     () => routes,
    getResources:  () => resources,
    getStore:      () => store,
    getConfig:     () => currentConfig,
    routeOverrides,
    resourceOverrides,
    subscribeLog,
    get onProxyResponse() { return onProxyResponse; },
    set onProxyResponse(fn: ((entry: RecordedResponse) => void) | null) { onProxyResponse = fn; },
    get running() { return _running; },
    get port()    { return currentConfig.port; },
    get host()    { return currentConfig.host; },
  };
}

// ── Legacy entry point (backwards compatible) ────

export async function startServer(routesFile: string, options: ServerOptions): Promise<void> {
  const resolved = path.resolve(routesFile);

  try {
    await fs.access(resolved);
  } catch {
    throw new Error(
      `Routes file not found: ${resolved}\n  Run ${chalk.bold('quickmock --init')} to create an example routes.json`,
    );
  }

  const content = await fs.readFile(resolved, 'utf-8');
  const fileConfig = JSON.parse(content) as RoutesFileConfig | RouteConfig[];
  const routeConfigs = Array.isArray(fileConfig) ? fileConfig : (fileConfig.routes ?? []);
  const resourceDefs = !Array.isArray(fileConfig) ? (fileConfig.resources ?? {}) : {};

  const config: MockServerConfig = {
    id: 'legacy',
    name: path.basename(routesFile, '.json'),
    port: options.port,
    host: options.host,
    cors: options.cors,
    delay: options.delay,
    routes: routeConfigs,
    resources: resourceDefs,
    profiles: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const server = createMockServer(config);
  await server.start();

  // Banner
  const W = 54;
  const routeList = server.getRoutes();
  const resList   = server.getResources();

  console.log('');
  console.log(`  ${c.brand('◆  quickmock  ◆')}`);
  console.log(`  ${c.dim('Mock API server running')}`);
  console.log('');
  console.log(`  ${c.dim('URL')}        ${c.success(`http://${options.host}:${options.port}`)}`);
  console.log(`  ${c.dim('Routes')}     ${c.path(resolved)}`);
  console.log(`  ${c.dim('CORS')}       ${options.cors ? c.success('enabled') : c.warn('disabled')}`);
  console.log(`  ${c.dim('Watch')}      ${options.watch ? c.success('enabled') : c.dim('disabled')}`);
  if (options.delay > 0) {
    console.log(`  ${c.dim('Delay')}      ${c.time(options.delay + 'ms')}`);
  }
  console.log('');

  if (routeList.length > 0) {
    console.log(`  ${c.dim('Registered routes:')}`);
    console.log(`  ${c.dim('─'.repeat(W))}`);
    for (const route of routeList) {
      const mFn  = c.method[route.method] ?? c.dim;
      const mStr = mFn(route.method.padEnd(8));
      const extras: string[] = [];
      if (route.delay)              extras.push(c.time(`${route.delay}ms`));
      if (route.error)              extras.push(c.warn(`${(route.error * 100).toFixed(0)}% fail`));
      if (route.responses?.length)  extras.push(c.dim(`${route.responses.length} variants`));
      const extStr = extras.length ? `  ${c.dim('[')}${extras.join(c.dim(', '))}${c.dim(']')}` : '';
      console.log(`  ${mStr}${c.path(route.path.padEnd(25))} ${c.dim('→')} ${c.status(route.status)}${extStr}`);
    }
    console.log(`  ${c.dim('─'.repeat(W))}`);
    console.log('');
  }

  if (resList.length > 0) {
    console.log(`  ${c.dim('Resources (stateful):')}`);
    console.log(`  ${c.dim('─'.repeat(W))}`);
    for (const res of resList) {
      const result = server.getStore().list(res.name);
      const extras: string[] = [];
      if (res.delay) extras.push(c.time(`${res.delay}ms`));
      if (res.error) extras.push(c.warn(`${(res.error * 100).toFixed(0)}% fail`));
      const extStr = extras.length ? `  ${c.dim('[')}${extras.join(c.dim(', '))}${c.dim(']')}` : '';
      console.log(`  ${c.success(res.name.padEnd(10))}${c.path(res.basePath.padEnd(25))} ${c.dim(`${result.total} items`)}${extStr}`);
    }
    console.log(`  ${c.dim('─'.repeat(W))}`);
    console.log(`  ${c.dim('POST /__reset to re-seed all collections')}`);
    console.log('');
  }

  console.log(`  ${c.dim('Waiting for requests...')}  ${c.dim('(Ctrl+C to stop)')}`);
  console.log('');

  // Auto-reload
  if (options.watch) {
    watchFile(resolved, async () => {
      try {
        const newContent = await fs.readFile(resolved, 'utf-8');
        const newFileConfig = JSON.parse(newContent) as RoutesFileConfig | RouteConfig[];
        const newRoutes = Array.isArray(newFileConfig) ? newFileConfig : (newFileConfig.routes ?? []);
        const newResources = !Array.isArray(newFileConfig) ? (newFileConfig.resources ?? {}) : {};
        server.reload({ ...config, routes: newRoutes, resources: newResources, updatedAt: Date.now() });
        const parts = [];
        if (server.getRoutes().length > 0) parts.push(`${server.getRoutes().length} routes`);
        if (server.getResources().length > 0) parts.push(`${server.getResources().length} resources`);
        console.log(`  ${c.success('↻')}  ${c.dim('Reloaded')} ${c.dim(`(${parts.join(', ')})`)}`);
      } catch (err) {
        console.log(`  ${c.error('✗')}  ${c.dim('Reload failed:')} ${(err as Error).message}`);
      }
    });
  }

  process.on('SIGINT', () => {
    console.log(`\n  ${c.dim('Shutting down...')}\n`);
    server.stop().then(() => process.exit(0));
  });
}
