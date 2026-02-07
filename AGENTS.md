# QuickMock

Zero-config mock API server for rapid frontend development.

## Architecture

```
bin/quickmock.js      → CLI shim (imports dist/cli.js)
src/cli.ts            → CLI entry, argument parsing, initialization
src/server.ts         → HTTP server, routing, request handling, logging
src/store.ts          → In-memory stateful data store for resources
src/dashboard.ts      → Dashboard handler: static serving, API, SSE
src/dashboard/        → Dashboard frontend (HTML, CSS, JS)
src/template.ts       → Template engine, fake data generators
src/watcher.ts        → File watching with debounced reload
src/types.ts          → Shared type definitions
routes.json           → User-defined route and resource configuration
```

### Module Dependencies

```
bin/quickmock.js → dist/cli.js (compiled from src/cli.ts)

src/cli.ts → src/server.ts → src/template.ts
             ↓               src/store.ts
             src/types.ts    src/dashboard.ts → src/types.ts
                             src/watcher.ts      src/store.ts
                             src/types.ts
```

- `cli` consumes `server` (calls `startServer`) and `types` (for `ServerOptions`)
- `server` consumes `template` (response processing), `store` (stateful CRUD), `dashboard` (UI handler), `watcher` (hot-reload), and `types`
- `dashboard` consumes `types` (for `Route`, `RuntimeOverride`, `LogEntry`, etc.) and `store` (for `Store` type)
- `template` consumes `types` (for `TemplateContext`, `JsonValue`)
- `store` consumes `types` (for `JsonRecord`, `JsonValue`)
- `watcher` and `types` are leaf modules with no internal dependencies

### Build

Source in `src/*.ts` compiles to `dist/` via `tsc`. The `bin/quickmock.js` shim imports from `dist/cli.js`. The build script also copies `src/dashboard/` to `dist/dashboard/` for static file serving.

## Module Contracts

**cli** — Parses CLI arguments, handles `--help` and `--init`, then delegates to `startServer`. All user-facing CLI output lives here.

**server** — Owns the full HTTP lifecycle. Delegates `/__dashboard` and `/__api` paths to `dashboard`, then matches custom routes, then resource routes, then 404. Manages runtime overrides (delay, error, disabled) set from the dashboard. Extracts parameters, parses request data, delegates response processing to `template` (for custom routes) or `store` (for resource CRUD). Handles CORS, colored logging, log event emission, and graceful shutdown.

**store** — Pure data module. Manages named in-memory collections of JSON records. Supports seed, list (with filtering and pagination), get, create, update, patch, remove, and reset. No I/O, no HTTP concerns.

**template** — Pure processing module. Resolves `{{variable}}` templates against request context (`params`, `query`, `body`, `headers`) and built-in faker generators. Recursively processes nested structures with type coercion. No I/O, no side effects.

**watcher** — Utility module. Watches a file for changes, debounces rapid events, and recovers from temporary file deletions. No domain logic.

**dashboard** — Serves the web dashboard UI. Handles `/__dashboard` (static files) and `/__api/*` (state query, runtime override patches, SSE log stream). Receives a `DashboardContext` from `server` with live references to routes, resources, store, overrides, and log subscription. No direct HTTP server creation.

**types** — Shared type definitions. All interfaces and types used across module boundaries live here: `Route`, `RouteConfig`, `ResourceConfig`, `ServerOptions`, `TemplateContext`, `JsonValue`, `JsonRecord`, `LogEntry`, `RuntimeOverride`, `LogListener`.

## Route Schema

| Field         | Description                              |
|---------------|------------------------------------------|
| `method`      | HTTP method or `*` for any               |
| `path`        | URL path with `:param` segments          |
| `status`      | Response status code                     |
| `response`    | Response body (object, array, or null)   |
| `responses`   | Variant array, randomly selected         |
| `headers`     | Custom response headers                  |
| `delay`       | Per-route latency simulation (ms)        |
| `error`       | Error injection probability (0.0–1.0)    |
| `errorStatus` | Status code for injected errors          |

## Resource Schema

| Field         | Description                              |
|---------------|------------------------------------------|
| `basePath`    | URL prefix (e.g. `/api/users`)           |
| `seed`        | Template object for generating items     |
| `count`       | Number of seed items (default: 5)        |
| `idField`     | ID field name (default: `"id"`)          |
| `delay`       | Per-resource latency simulation (ms)     |
| `error`       | Error injection probability (0.0–1.0)    |
| `errorStatus` | Status code for injected errors          |

Each resource auto-generates: `GET` (list), `GET /:id`, `POST`, `PUT /:id`, `PATCH /:id`, `DELETE /:id`. List supports `?limit=N&offset=N` pagination and field filtering (e.g. `?role=admin`). `POST /__reset` re-seeds all collections.

## Template Syntax

- **Variables:** `{{params.id}}`, `{{query.page}}`, `{{body.name}}`, `{{headers.authorization}}`
- **Generators:** `{{faker.name}}`, `{{faker.email}}`, `{{faker.id}}`, `{{faker.number}}`, `{{faker.boolean}}`, `{{faker.date}}`, `{{faker.company}}`, `{{faker.url}}`, `{{faker.lorem}}`, etc.
- Templates are resolved recursively through all nested objects and arrays.
- String values are coerced to appropriate types (numbers, booleans) when possible.

## Request Flow

1. CORS headers (if enabled)
2. `/__dashboard` or `/__api/*` → dashboard handler (static files, API, SSE)
3. `POST /__reset` → re-seed all store collections
4. Match custom routes (defined in `routes` array) → check overrides (disabled → 503, delay, error) → template-based response
5. Match resource routes (derived from `resources` definitions) → check overrides → store CRUD
6. 404

Custom routes take precedence over resource routes, allowing selective overrides.

## Principles

1. **Understand before changing** — Read and comprehend existing code before editing. Never assume.
2. **Trace the full dependency chain** — Every change must account for all importing and consuming modules. A change is not complete until all affected dependents are updated.
3. **Expand only when necessary** — Prefer extending existing modules over adding new ones. Only introduce new files or abstractions when there is a clear, justified need.
4. **Single responsibility** — Each module owns exactly one concern. Keep it that way.
5. **No dead code** — Remove unused imports, functions, and variables during refactors.
6. **Consistent patterns** — Follow the conventions already in the codebase. Don't introduce new patterns without justification.
7. **Clean interfaces** — Exports should have clear, well-defined inputs and outputs. Keep module boundaries tight.
8. **Type safety** — All shared interfaces live in `types.ts`. Use strict typing. Avoid `any`.
