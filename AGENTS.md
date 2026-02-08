# QuickMock

Zero-config mock API server with a management UI for rapid frontend development.

## Architecture

```
bin/quickmock.js        → CLI shim (imports dist/cli.js)
src/cli.ts              → CLI entry: management mode or legacy single-server mode
src/server.ts           → createMockServer() factory, request handling, logging
src/store.ts            → In-memory stateful data store for resources
src/dashboard.ts        → Management server: React SPA serving, full management API
src/manager.ts          → Multi-instance lifecycle (create, start, stop, delete)
src/project.ts          → Persistent storage (.quickmock/servers/*.json)
src/schema/sql.ts       → SQL DDL parser → ResourceConfig[]
src/schema/openapi.ts   → OpenAPI/Swagger parser → RouteConfig[] + ResourceConfig[]
src/template.ts         → Template engine, fake data generators
src/watcher.ts          → File watching with debounced reload
src/types.ts            → Shared type definitions
dashboard-ui/           → React + Vite + Tailwind CSS frontend (builds to dist/)
routes.json             → User-defined route/resource config (legacy mode)
.quickmock/             → Persistent server configs (management mode)
```

### Module Dependencies

```
src/cli.ts → src/server.ts (legacy mode: startServer)
             src/dashboard.ts (management mode: createManagementServer)
             src/types.ts

src/server.ts → src/template.ts
                src/store.ts
                src/watcher.ts (legacy mode only)
                src/types.ts

src/dashboard.ts → src/manager.ts → src/server.ts (createMockServer)
                                     src/project.ts
                                     src/types.ts
                   src/project.ts → src/types.ts
                   src/schema/sql.ts → src/types.ts
                   src/schema/openapi.ts → src/types.ts
                   src/types.ts

src/template.ts → src/types.ts
src/store.ts → src/types.ts
src/watcher.ts (no internal dependencies)
src/types.ts (no internal dependencies)
```

### Build

Backend: `tsc` compiles `src/*.ts` to `dist/`.
Frontend: `cd dashboard-ui && npm run build` outputs to `dashboard-ui/dist/`.
Full build: `npm run build` runs both, then copies frontend output to `dist/dashboard/`.
Dev: `src/dashboard` is a symlink to `dashboard-ui/dist/` for tsx dev mode.

## Module Contracts

**cli** — Two modes: (1) `quickmock` with no routes file starts management mode via `createManagementServer`; (2) `quickmock routes.json` starts legacy single-server mode via `startServer`. Handles `--help`, `--init`, `--port`, `--host`.

**server** — Exports `createMockServer(config)` factory that returns a `MockServer` instance with start/stop/reload/getRoutes/getResources/subscribeLog. Each instance has isolated state (routes, resources, store, overrides, log listeners). Also exports `startServer(file, options)` for backwards-compatible legacy mode. No global state.

**dashboard** — Exports `createManagementServer(port, host)` that creates an HTTP server handling: React SPA at `/__dashboard` (with SPA fallback), management API at `/__api/*` (server CRUD, route/resource CRUD, profiles, runtime overrides, schema import, SSE logs). Delegates to `manager` and `project` for state management.

**manager** — Server instance lifecycle. Tracks running `MockServer` instances in a Map. Provides `createInstance`, `startInstance`, `stopInstance`, `deleteInstance`, `getInstance`, `listServers`. Forwards per-instance logs to a global log stream.

**project** — Persistent storage. Reads/writes `MockServerConfig` JSON files in `.quickmock/servers/`. Provides `listServerConfigs`, `getServerConfig`, `saveServerConfig`, `deleteServerConfig`, `createDefaultConfig`.

**schema/sql** — Parses SQL DDL (`CREATE TABLE` statements). Extracts table names, columns, types, primary keys, foreign keys. Maps column names and SQL types to appropriate faker generators. Returns `ResourceConfig[]`.

**schema/openapi** — Parses OpenAPI 3.x and Swagger 2.x specs. Extracts paths, methods, response schemas. Detects CRUD resource patterns. Generates `RouteConfig[]` and `ResourceConfig[]` with faker-mapped seed templates.

**store** — Pure data module. Manages named in-memory collections of JSON records. Supports seed, list (filtering, pagination), get, create, update, patch, remove, reset. No I/O.

**template** — Pure processing module. Resolves `{{variable}}` templates against request context and built-in faker generators. Recursively processes nested structures with type coercion. No I/O.

**watcher** — Utility. Watches a file for changes, debounces rapid events, recovers from temporary file deletions.

**types** — Shared type definitions: `Route`, `RouteConfig`, `ResourceConfig`, `ResourceEntry`, `MockServerConfig`, `Profile`, `RuntimeOverride`, `ServerOptions`, `TemplateContext`, `JsonValue`, `JsonRecord`, `LogEntry`, `LogListener`.

## Management API

All under `/__api/` prefix, JSON responses.

| Endpoint | Method | Description |
|---|---|---|
| `/__api/servers` | GET | List servers with running status |
| `/__api/servers` | POST | Create new server config |
| `/__api/servers/:id` | GET | Get server detail + runtime state |
| `/__api/servers/:id` | PATCH | Update server config |
| `/__api/servers/:id` | DELETE | Delete server (stops if running) |
| `/__api/servers/:id/start` | POST | Start server instance |
| `/__api/servers/:id/stop` | POST | Stop server instance |
| `/__api/servers/:id/routes` | GET/POST | List/add routes |
| `/__api/servers/:id/routes/:idx` | PATCH/DELETE | Update/delete route |
| `/__api/servers/:id/resources` | GET/POST | List/add resources |
| `/__api/servers/:id/resources/:name` | PATCH/DELETE | Update/delete resource |
| `/__api/servers/:id/profiles` | GET/POST | List/create profiles |
| `/__api/servers/:id/profiles/:name` | PATCH/DELETE | Update/delete profile |
| `/__api/servers/:id/profiles/:name/activate` | POST | Activate profile |
| `/__api/servers/:id/overrides/routes/:idx` | PATCH | Set runtime route override |
| `/__api/servers/:id/overrides/resources/:name` | PATCH | Set runtime resource override |
| `/__api/servers/:id/log` | GET | SSE stream for server logs |
| `/__api/log` | GET | SSE stream for all server logs |
| `/__api/import/sql` | POST | Parse SQL DDL, return resources |
| `/__api/import/openapi` | POST | Parse OpenAPI, return routes/resources |

## Data Model

```typescript
interface MockServerConfig {
  id: string; name: string; description?: string;
  port: number; host: string; cors: boolean; delay: number;
  routes: RouteConfig[];
  resources: Record<string, ResourceConfig>;
  profiles: Record<string, Profile>;
  activeProfile?: string;
  createdAt: number; updatedAt: number;
}

interface Profile {
  name: string; description?: string;
  disabledRoutes: number[];
  disabledResources: string[];
  overrides: { routes: Record<number, RuntimeOverride>; resources: Record<string, RuntimeOverride> };
}
```

## Route & Resource Schemas

Unchanged from v1 — see `routes.json` format and `{{faker.*}}` template syntax.

## Request Flow (per mock server instance)

1. CORS headers (if enabled)
2. `POST /__reset` → re-seed all store collections
3. Match custom routes → check overrides (disabled → 503, delay, error) → template response
4. Match resource routes → check overrides → store CRUD
5. 404

## Principles

1. **Understand before changing** — Read and comprehend existing code before editing
2. **Trace the full dependency chain** — Every change must account for all importing and consuming modules
3. **Expand only when necessary** — Prefer extending existing modules over adding new ones
4. **Single responsibility** — Each module owns exactly one concern
5. **No dead code** — Remove unused imports, functions, and variables during refactors
6. **Consistent patterns** — Follow the conventions already in the codebase
7. **Clean interfaces** — Exports should have clear, well-defined inputs and outputs
8. **Type safety** — All shared interfaces live in `types.ts`. Use strict typing. Avoid `any`
