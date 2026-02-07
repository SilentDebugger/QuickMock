import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import { processTemplate } from './template.js';
import { watchFile } from './watcher.js';
import { createStore } from './store.js';
import type { Store } from './store.js';
import type { Route, RouteConfig, ResourceConfig, RoutesFileConfig, ServerOptions, TemplateContext, JsonValue, JsonRecord } from './types.js';

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

// ── Route state ────────────────────────────────────

let routes: Route[] = [];

// ── Resource state ────────────────────────────────

const store: Store = createStore();

interface ResourceEntry {
  name: string;
  basePath: string;
  idField: string;
  delay?: number;
  error?: number;
  errorStatus?: number;
}

let resources: ResourceEntry[] = [];

// ── Route matching ─────────────────────────────────

interface RouteMatch {
  route: Route;
  params: Record<string, string>;
}

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

// ── Helpers ────────────────────────────────────────

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

// ── Resource matching ─────────────────────────────

interface ResourceMatch {
  resource: ResourceEntry;
  id?: string;
}

function matchResource(method: string, pathname: string): ResourceMatch | null {
  for (const resource of resources) {
    const base = resource.basePath.replace(/\/+$/, '');
    const segs = pathname.replace(/\/+$/, '').split('/');
    const baseSegs = base.split('/').filter(Boolean);
    const pathSegs = segs.filter(Boolean);

    // Exact match: GET/POST on base path (list / create)
    if (pathSegs.length === baseSegs.length) {
      const match = baseSegs.every((seg, i) => seg === pathSegs[i]);
      if (match && (method === 'GET' || method === 'POST')) {
        return { resource };
      }
    }

    // ID match: GET/PUT/PATCH/DELETE on base path + /:id
    if (pathSegs.length === baseSegs.length + 1) {
      const match = baseSegs.every((seg, i) => seg === pathSegs[i]);
      if (match && ['GET', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        return { resource, id: decodeURIComponent(pathSegs[pathSegs.length - 1]) };
      }
    }
  }

  return null;
}

// ── Resource CRUD handler ─────────────────────────

function handleResourceCrud(
  method: string,
  match: ResourceMatch,
  body: JsonValue,
  query: Record<string, string>,
): { status: number; data: JsonValue; headers?: Record<string, string> } {
  const { resource, id } = match;

  // GET collection (list)
  if (method === 'GET' && !id) {
    const { limit, offset, ...filters } = query;
    const parsedLimit = limit !== undefined ? parseInt(limit) : undefined;
    const parsedOffset = offset !== undefined ? parseInt(offset) : undefined;
    const result = store.list(resource.name, filters, parsedLimit, parsedOffset);
    const headers: Record<string, string> = { 'X-Total-Count': String(result.total) };
    return { status: 200, data: result.items as JsonValue, headers };
  }

  // GET single item
  if (method === 'GET' && id) {
    const item = store.get(resource.name, id);
    if (!item) return { status: 404, data: { error: 'Not Found', message: `${resource.name} "${id}" not found` } };
    return { status: 200, data: item as JsonValue };
  }

  // POST create
  if (method === 'POST') {
    const incoming = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as JsonRecord;
    const item = store.create(resource.name, incoming);
    return { status: 201, data: item as JsonValue };
  }

  // PUT full replace
  if (method === 'PUT' && id) {
    const incoming = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as JsonRecord;
    const item = store.update(resource.name, id, incoming);
    if (!item) return { status: 404, data: { error: 'Not Found', message: `${resource.name} "${id}" not found` } };
    return { status: 200, data: item as JsonValue };
  }

  // PATCH partial merge
  if (method === 'PATCH' && id) {
    const incoming = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as JsonRecord;
    const item = store.patch(resource.name, id, incoming);
    if (!item) return { status: 404, data: { error: 'Not Found', message: `${resource.name} "${id}" not found` } };
    return { status: 200, data: item as JsonValue };
  }

  // DELETE
  if (method === 'DELETE' && id) {
    const removed = store.remove(resource.name, id);
    if (!removed) return { status: 404, data: { error: 'Not Found', message: `${resource.name} "${id}" not found` } };
    return { status: 204, data: null };
  }

  return { status: 405, data: { error: 'Method Not Allowed' } };
}

// ── Request handler ────────────────────────────────

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  options: ServerOptions,
): Promise<void> {
  const start = Date.now();
  const method = req.method!.toUpperCase();
  const pathname = new URL(req.url!, `http://${req.headers.host}`).pathname;

  // CORS
  if (options.cors) {
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
    const resBody = JSON.stringify({ message: 'All collections re-seeded' });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(resBody);
    logRequest(method, pathname, 200, Date.now() - start);
    console.log(`  ${c.success('↻')}  ${c.dim('Store reset — all collections re-seeded')}`);
    return;
  }

  // Match custom routes first
  const match = matchRoute(method, pathname);

  if (match) {
    const { route, params } = match;

    // Delay
    const delay = route.delay ?? options.delay ?? 0;
    if (delay > 0) await new Promise<void>((r) => setTimeout(r, delay));

    // Random error simulation
    if (route.error && Math.random() < route.error) {
      const errStatus = route.errorStatus || 500;
      const body = JSON.stringify({
        error: http.STATUS_CODES[errStatus] || 'Error',
        message: 'Simulated failure (quickmock error injection)',
      });
      res.writeHead(errStatus, { 'Content-Type': 'application/json' });
      res.end(body);
      logRequest(method, pathname, errStatus, Date.now() - start);
      return;
    }

    // Build template context
    const reqBody = await parseBody(req);
    const query   = parseQuery(req.url!);
    const ctx: TemplateContext = { params, body: reqBody, query, headers: req.headers };

    // Pick response (support "responses" array for random variants)
    let responseData: JsonValue | undefined = route.response;
    if (route.responses && route.responses.length > 0) {
      responseData = route.responses[Math.floor(Math.random() * route.responses.length)];
    }

    // Process templates
    if (responseData !== undefined && responseData !== null) {
      responseData = processTemplate(responseData, ctx);
    }

    // Send
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

  // Match resource routes
  const resourceMatch = matchResource(method, pathname);

  if (resourceMatch) {
    const { resource } = resourceMatch;

    // Per-resource delay
    const delay = resource.delay ?? options.delay ?? 0;
    if (delay > 0) await new Promise<void>((r) => setTimeout(r, delay));

    // Per-resource error injection
    if (resource.error && Math.random() < resource.error) {
      const errStatus = resource.errorStatus || 500;
      const body = JSON.stringify({
        error: http.STATUS_CODES[errStatus] || 'Error',
        message: 'Simulated failure (quickmock error injection)',
      });
      res.writeHead(errStatus, { 'Content-Type': 'application/json' });
      res.end(body);
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

  // 404
  const body = JSON.stringify({ error: 'Not Found', message: `No mock for ${method} ${pathname}` });
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(body);
  logRequest(method, pathname, 404, Date.now() - start);
}

// ── Logging ────────────────────────────────────────

function logRequest(method: string, pathname: string, status: number, ms: number): void {
  const mFn  = c.method[method] ?? c.dim;
  const mStr = mFn(method.padEnd(7));
  console.log(`  ${mStr} ${c.path(pathname)}  ${c.dim('→')}  ${c.status(status)}  ${c.dim('in')} ${c.time(ms + 'ms')}`);
}

// ── Route loader ───────────────────────────────────

/** Empty template context used for seed generation (no request data). */
const EMPTY_CTX: TemplateContext = {
  params: {},
  body: null,
  query: {},
  headers: {},
};

async function loadRoutes(filePath: string): Promise<Route[]> {
  const content = await fs.readFile(filePath, 'utf-8');
  const config  = JSON.parse(content) as RoutesFileConfig | RouteConfig[];
  const raw     = Array.isArray(config) ? config : (config.routes ?? []);

  routes = raw.map((r): Route => ({
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

  // Parse and seed resources
  const resourceDefs = !Array.isArray(config) ? (config.resources ?? {}) : {};
  resources = [];

  for (const [name, cfg] of Object.entries(resourceDefs)) {
    const idField = cfg.idField ?? 'id';
    const count   = cfg.count ?? 5;

    // Generate seed items by processing the template N times
    const seedItems: JsonRecord[] = [];
    for (let i = 0; i < count; i++) {
      const processed = processTemplate(cfg.seed, EMPTY_CTX);
      if (processed && typeof processed === 'object' && !Array.isArray(processed)) {
        seedItems.push(processed as JsonRecord);
      }
    }

    store.seed(name, idField, seedItems);
    resources.push({
      name,
      basePath: cfg.basePath,
      idField,
      delay: cfg.delay,
      error: cfg.error,
      errorStatus: cfg.errorStatus,
    });
  }

  return routes;
}

// ── Startup banner ─────────────────────────────────

function printBanner(routesFile: string, options: ServerOptions, routeList: Route[]): void {
  const W = 54;

  console.log('');
  console.log(`  ${c.brand('◆  quickmock  ◆')}`);
  console.log(`  ${c.dim('Mock API server running')}`);
  console.log('');
  console.log(`  ${c.dim('URL')}        ${c.success(`http://${options.host}:${options.port}`)}`);
  console.log(`  ${c.dim('Routes')}     ${c.path(path.resolve(routesFile))}`);
  console.log(`  ${c.dim('CORS')}       ${options.cors ? c.success('enabled') : c.warn('disabled')}`);
  console.log(`  ${c.dim('Watch')}      ${options.watch ? c.success('enabled') : c.dim('disabled')}`);
  if (options.delay > 0) {
    console.log(`  ${c.dim('Delay')}      ${c.time(options.delay + 'ms')}`);
  }
  console.log('');

  // Custom routes
  if (routeList.length > 0) {
    console.log(`  ${c.dim('Registered routes:')}`);
    console.log(`  ${c.dim('─'.repeat(W))}`);

    for (const route of routeList) {
      const mFn  = c.method[route.method] ?? c.dim;
      const mStr = mFn(route.method.padEnd(8));
      const sStr = c.status(route.status);
      const extras: string[] = [];
      if (route.delay)              extras.push(c.time(`${route.delay}ms`));
      if (route.error)              extras.push(c.warn(`${(route.error * 100).toFixed(0)}% fail`));
      if (route.responses?.length)  extras.push(c.dim(`${route.responses.length} variants`));
      const extStr = extras.length ? `  ${c.dim('[')}${extras.join(c.dim(', '))}${c.dim(']')}` : '';

      console.log(`  ${mStr}${c.path(route.path.padEnd(25))} ${c.dim('→')} ${sStr}${extStr}`);
    }

    console.log(`  ${c.dim('─'.repeat(W))}`);
    console.log('');
  }

  // Resources
  if (resources.length > 0) {
    console.log(`  ${c.dim('Resources (stateful):')}`);
    console.log(`  ${c.dim('─'.repeat(W))}`);

    for (const res of resources) {
      const result = store.list(res.name);
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
}

// ── Public entry point ─────────────────────────────

export async function startServer(routesFile: string, options: ServerOptions): Promise<void> {
  const resolved = path.resolve(routesFile);

  // Check routes file exists
  try {
    await fs.access(resolved);
  } catch {
    throw new Error(
      `Routes file not found: ${resolved}\n  Run ${chalk.bold('quickmock --init')} to create an example routes.json`,
    );
  }

  // Load routes and resources
  const routeList = await loadRoutes(resolved);
  if (routeList.length === 0 && resources.length === 0) {
    throw new Error('No routes or resources defined in the routes file');
  }

  // Create server
  const server = http.createServer((req, res) => {
    handleRequest(req, res, options).catch((err: unknown) => {
      console.error(`  ${c.error('Error:')} ${(err as Error).message}`);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
      }
      res.end(JSON.stringify({ error: 'Internal Server Error' }));
    });
  });

  // Start listening
  await new Promise<void>((resolve, reject) => {
    server.listen(options.port, options.host, () => resolve());
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`Port ${options.port} is already in use`));
      } else {
        reject(err);
      }
    });
  });

  // Banner
  printBanner(routesFile, options, routeList);

  // Auto-reload
  if (options.watch) {
    watchFile(resolved, async () => {
      try {
        const updated = await loadRoutes(resolved);
        const parts = [];
        if (updated.length > 0) parts.push(`${updated.length} routes`);
        if (resources.length > 0) parts.push(`${resources.length} resources`);
        console.log(`  ${c.success('↻')}  ${c.dim('Reloaded')} ${c.dim(`(${parts.join(', ')})`)}`);
      } catch (err) {
        console.log(`  ${c.error('✗')}  ${c.dim('Reload failed:')} ${(err as Error).message}`);
      }
    });
  }

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log(`\n  ${c.dim('Shutting down...')}\n`);
    server.close();
    process.exit(0);
  });
}
