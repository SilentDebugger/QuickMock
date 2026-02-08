# quickmock

Zero-config mock API server with a management dashboard. Create mock backends from scratch, SQL schemas, or OpenAPI specs. Manage multiple servers with live logs, runtime overrides, and profiles.

## Quick start

```bash
npm install
npm run build                # build backend + React dashboard

# Management mode (UI)
node bin/quickmock.js        # opens dashboard at http://localhost:3000/__dashboard

# Legacy single-server mode
node bin/quickmock.js --init # creates example routes.json
node bin/quickmock.js routes.json
```

## Usage

```bash
quickmock                      # Start management dashboard
quickmock [routes-file]        # Start single server from file (legacy)
quickmock --port=4000          # Dashboard on custom port
quickmock --init               # Generate example routes.json
quickmock --help               # Show all options
```

## Management Dashboard

Run `quickmock` with no arguments to open the management UI at `http://localhost:3000/__dashboard`.

**Features:**
- Create and manage multiple mock servers
- Visual route and resource editors
- Import from SQL DDL or OpenAPI specs
- Live request log (SSE-powered)
- Try-it request panel
- Profiles for different configurations
- Start/stop servers independently

## Schema Import

### SQL DDL

Paste `CREATE TABLE` statements and quickmock auto-generates CRUD resources with appropriate faker data based on column names and types.

### OpenAPI / Swagger

Paste a JSON spec (OpenAPI 3.x or Swagger 2.x) and quickmock generates routes and resources from the paths and schemas.

## Routes file (legacy mode)

```json
{
  "resources": {
    "users": {
      "basePath": "/api/users",
      "seed": {
        "id": "{{faker.id}}",
        "name": "{{faker.name}}",
        "email": "{{faker.email}}"
      },
      "count": 5
    }
  },
  "routes": [
    {
      "method": "GET",
      "path": "/api/users/:id",
      "status": 200,
      "response": {
        "id": "{{params.id}}",
        "name": "{{faker.name}}"
      }
    }
  ]
}
```

## Template variables

| Variable | Description |
|---|---|
| `{{params.x}}` | URL path parameter |
| `{{query.x}}` | Query string parameter |
| `{{body.x}}` | Request body field |
| `{{headers.x}}` | Request header |

## Faker functions

`{{faker.name}}` `{{faker.email}}` `{{faker.id}}` `{{faker.phone}}` `{{faker.company}}` `{{faker.number}}` `{{faker.boolean}}` `{{faker.date}}` `{{faker.url}}` `{{faker.avatar}}` `{{faker.color}}` `{{faker.ip}}` `{{faker.slug}}` `{{faker.title}}` `{{faker.lorem}}` `{{faker.paragraph}}`

## Features

- **Management UI** — React dashboard for creating and managing mock servers
- **Multiple servers** — Run several mock APIs simultaneously on different ports
- **Schema import** — Generate APIs from SQL DDL or OpenAPI specs
- **Stateful CRUD** — Declare resources, get full REST endpoints with in-memory storage
- **Dynamic params** — `/users/:id` extracts `id` into `{{params.id}}`
- **Fake data** — 16+ built-in generators via `{{faker.*}}`
- **Profiles** — Save and switch between different endpoint configurations
- **Live logs** — SSE-powered real-time request monitoring
- **Try-it panel** — Test endpoints directly from the dashboard
- **Runtime overrides** — Adjust delay, error rate, or disable endpoints on the fly
- **Delay simulation** — Per-route or global latency
- **Error injection** — `"error": 0.3` fails 30% of requests
- **Response variants** — `"responses": [...]` picks randomly each request
- **Hot-reload** — Edit routes.json, changes apply instantly (legacy mode)
- **CORS** — Enabled by default

## Development

```bash
npm run dev          # Start backend with tsx (auto-reload)
npm run dev:ui       # Start Vite dev server for React dashboard
npm run build        # Full production build
```
