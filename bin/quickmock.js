#!/usr/bin/env node

import path from 'path';
import fs from 'fs/promises';

const args = process.argv.slice(2);

// ── Help ───────────────────────────────────────────
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
  quickmock — Zero-config mock API server

  Usage:
    quickmock [routes-file] [options]

  Options:
    --port=N         Port to listen on (default: 3000)
    --host=HOST      Host to bind to (default: localhost)
    --no-watch       Disable auto-reload on file changes
    --no-cors        Disable CORS headers
    --delay=N        Global response delay in ms (default: 0)
    --init           Create an example routes.json
    --help, -h       Show this help

  Examples:
    quickmock                    Start with routes.json in cwd
    quickmock api-mock.json      Use a custom routes file
    quickmock --port=8080        Listen on port 8080
    quickmock --delay=200        Add 200ms latency to every response
    quickmock --init             Generate example routes.json

  Route file format:
    {
      "routes": [
        {
          "method": "GET",
          "path": "/api/users/:id",
          "status": 200,
          "delay": 500,
          "response": { "id": "{{params.id}}", "name": "{{faker.name}}" }
        }
      ]
    }

  Template variables:
    {{params.xxx}}      URL path parameters
    {{query.xxx}}       Query string parameters
    {{body.xxx}}        Request body fields
    {{headers.xxx}}     Request headers
    {{faker.name}}      Random full name
    {{faker.email}}     Random email
    {{faker.id}}        Random UUID
    {{faker.number}}    Random integer
    {{faker.boolean}}   Random true/false
    {{faker.date}}      Random ISO date
    {{faker.lorem}}     Random sentence
    ... and more (see docs)
  `);
  process.exit(0);
}

// ── Init: create example routes file ───────────────
if (args.includes('--init')) {
  const example = {
    routes: [
      {
        method: 'GET',
        path: '/api/users',
        status: 200,
        response: [
          { id: 1, name: '{{faker.name}}', email: '{{faker.email}}', role: 'admin' },
          { id: 2, name: '{{faker.name}}', email: '{{faker.email}}', role: 'user' },
          { id: 3, name: '{{faker.name}}', email: '{{faker.email}}', role: 'user' },
        ],
      },
      {
        method: 'GET',
        path: '/api/users/:id',
        status: 200,
        response: {
          id: '{{params.id}}',
          name: '{{faker.name}}',
          email: '{{faker.email}}',
          phone: '{{faker.phone}}',
          company: '{{faker.company}}',
          avatar: '{{faker.avatar}}',
          createdAt: '{{faker.date}}',
        },
      },
      {
        method: 'POST',
        path: '/api/users',
        status: 201,
        response: {
          id: '{{faker.id}}',
          name: '{{body.name}}',
          email: '{{body.email}}',
          message: 'User created successfully',
        },
      },
      {
        method: 'PUT',
        path: '/api/users/:id',
        status: 200,
        response: {
          id: '{{params.id}}',
          message: 'User updated successfully',
        },
      },
      {
        method: 'DELETE',
        path: '/api/users/:id',
        status: 204,
      },
      {
        method: 'GET',
        path: '/api/posts',
        status: 200,
        delay: 500,
        response: [
          {
            id: 1,
            title: '{{faker.lorem}}',
            body: '{{faker.paragraph}}',
            author: '{{faker.name}}',
            publishedAt: '{{faker.date}}',
          },
          {
            id: 2,
            title: '{{faker.lorem}}',
            body: '{{faker.paragraph}}',
            author: '{{faker.name}}',
            publishedAt: '{{faker.date}}',
          },
        ],
      },
      {
        method: 'GET',
        path: '/api/flaky',
        status: 200,
        error: 0.3,
        errorStatus: 503,
        response: { data: 'This endpoint fails 30% of the time' },
      },
      {
        method: 'GET',
        path: '/api/health',
        status: 200,
        response: {
          status: 'ok',
          uptime: '{{faker.number}}',
          timestamp: '{{faker.date}}',
        },
      },
    ],
  };

  const filePath = path.resolve('routes.json');
  await fs.writeFile(filePath, JSON.stringify(example, null, 2) + '\n');
  console.log(`\n  Created ${filePath}\n`);
  process.exit(0);
}

// ── Parse options ──────────────────────────────────
const flags = args.filter(a => a.startsWith('--'));
const routesFile = args.find(a => !a.startsWith('-')) || 'routes.json';

const options = {
  port: 3000,
  host: 'localhost',
  watch: !flags.includes('--no-watch'),
  cors: !flags.includes('--no-cors'),
  delay: 0,
};

const portFlag = flags.find(f => f.startsWith('--port='));
if (portFlag) options.port = parseInt(portFlag.split('=')[1]) || 3000;

const hostFlag = flags.find(f => f.startsWith('--host='));
if (hostFlag) options.host = hostFlag.split('=')[1] || 'localhost';

const delayFlag = flags.find(f => f.startsWith('--delay='));
if (delayFlag) options.delay = parseInt(delayFlag.split('=')[1]) || 0;

// ── Start ──────────────────────────────────────────
const { startServer } = await import('../src/server.js');

startServer(routesFile, options).catch(err => {
  console.error(`\n  Error: ${err.message}\n`);
  process.exit(1);
});
