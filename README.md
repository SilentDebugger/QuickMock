# quickmock

Zero-config mock API server. Define endpoints in JSON, get a running server with fake data, CORS, latency simulation, and hot-reload.

## Quick start

```bash
npm install
node bin/quickmock.js --init   # creates example routes.json
node bin/quickmock.js           # starts on http://localhost:3000
```

## Usage

```bash
quickmock [routes-file] [options]

Options:
  --port=N       Port (default: 3000)
  --delay=N      Global latency in ms
  --no-cors      Disable CORS
  --no-watch     Disable hot-reload
  --init         Generate example routes.json
  --json         Output as JSON
```

## Routes file

```json
{
  "routes": [
    {
      "method": "GET",
      "path": "/api/users/:id",
      "status": 200,
      "delay": 200,
      "response": {
        "id": "{{params.id}}",
        "name": "{{faker.name}}",
        "email": "{{faker.email}}"
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

- **Dynamic params** — `/users/:id` extracts `id` into `{{params.id}}`
- **Fake data** — 16 built-in generators via `{{faker.*}}`
- **Body echo** — `{{body.name}}` returns what the client sent
- **Delay** — per-route or global latency simulation
- **Error injection** — `"error": 0.3` fails 30% of requests
- **Response variants** — `"responses": [...]` picks randomly each request
- **Hot-reload** — edit routes.json, changes apply instantly
- **CORS** — enabled by default, works with any frontend
