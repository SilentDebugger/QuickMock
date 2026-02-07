import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import { processTemplate } from './template.js';
import { watchFile } from './watcher.js';
import type { Route, RouteConfig, RoutesFileConfig, ServerOptions, TemplateContext, JsonValue } from './types.js';

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

  // Match
  const match = matchRoute(method, pathname);

  if (!match) {
    const body = JSON.stringify({ error: 'Not Found', message: `No mock for ${method} ${pathname}` });
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(body);
    logRequest(method, pathname, 404, Date.now() - start);
    return;
  }

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
}

// ── Logging ────────────────────────────────────────

function logRequest(method: string, pathname: string, status: number, ms: number): void {
  const mFn  = c.method[method] ?? c.dim;
  const mStr = mFn(method.padEnd(7));
  console.log(`  ${mStr} ${c.path(pathname)}  ${c.dim('→')}  ${c.status(status)}  ${c.dim('in')} ${c.time(ms + 'ms')}`);
}

// ── Route loader ───────────────────────────────────

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

  // Load routes
  const routeList = await loadRoutes(resolved);
  if (routeList.length === 0) throw new Error('No routes defined in the routes file');

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
        console.log(`  ${c.success('↻')}  ${c.dim('Routes reloaded')} ${c.dim(`(${updated.length} routes)`)}`);
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
