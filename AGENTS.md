# QuickMock

Zero-config mock API server for rapid frontend development.

## Architecture

```
bin/quickmock       → CLI entry, argument parsing, initialization
src/server          → HTTP server, routing, request handling, logging
src/template        → Template engine, fake data generators
src/watcher         → File watching with debounced reload
routes.json         → User-defined route configuration
```

### Module Dependencies

```
bin/quickmock → src/server → src/template
                           → src/watcher
```

`template` and `watcher` are independent leaf modules with no internal dependencies.

## Module Contracts

**server** — Owns the full HTTP lifecycle. Matches routes, extracts parameters, parses request data, delegates response processing to `template`, uses `watcher` for hot-reload. Handles CORS, colored logging, and graceful shutdown.

**template** — Pure processing module. Resolves `{{variable}}` templates against request context (`params`, `query`, `body`, `headers`) and built-in faker generators. Recursively processes nested structures with type coercion. No I/O, no side effects.

**watcher** — Utility module. Watches a file for changes, debounces rapid events, and recovers from temporary file deletions. No domain logic.

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

## Template Syntax

- **Variables:** `{{params.id}}`, `{{query.page}}`, `{{body.name}}`, `{{headers.authorization}}`
- **Generators:** `{{faker.name}}`, `{{faker.email}}`, `{{faker.id}}`, `{{faker.number}}`, `{{faker.boolean}}`, `{{faker.date}}`, `{{faker.company}}`, `{{faker.url}}`, `{{faker.lorem}}`, etc.
- Templates are resolved recursively through all nested objects and arrays.
- String values are coerced to appropriate types (numbers, booleans) when possible.

## Principles

1. **Understand before changing** — Read and comprehend existing code before editing. Never assume.
2. **Trace the full dependency chain** — Every change must account for all importing and consuming modules. A change is not complete until all affected dependents are updated.
3. **Expand only when necessary** — Prefer extending existing modules over adding new ones. Only introduce new files or abstractions when there is a clear, justified need.
4. **Single responsibility** — Each module owns exactly one concern. Keep it that way.
5. **No dead code** — Remove unused imports, functions, and variables during refactors.
6. **Consistent patterns** — Follow the conventions already in the codebase. Don't introduce new patterns without justification.
7. **Clean interfaces** — Exports should have clear, well-defined inputs and outputs. Keep module boundaries tight.
