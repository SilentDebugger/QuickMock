import path from 'node:path';
import fs from 'node:fs/promises';
import chalk from 'chalk';
import { startServer } from './server.js';
import { createManagementServer } from './dashboard.js';
import type { ServerOptions } from './types.js';

const args = process.argv.slice(2);

// ── Color palette ──────────────────────────────────

const c = {
  brand:   chalk.bold.hex('#F472B6'),
  success: chalk.hex('#10B981'),
  dim:     chalk.hex('#6B7280'),
  time:    chalk.hex('#06B6D4'),
};

// ── Help ───────────────────────────────────────────
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
  quickmock — Zero-config mock API server

  Usage:
    quickmock                    Start management UI (create & manage mock servers)
    quickmock [routes-file]      Start a single mock server from file (legacy mode)

  Options:
    --port=N         Port to listen on (default: 3000)
    --host=HOST      Host to bind to (default: localhost)
    --no-watch       Disable auto-reload on file changes (legacy mode)
    --no-cors        Disable CORS headers (legacy mode)
    --delay=N        Global response delay in ms (default: 0)
    --init           Create an example routes.json
    --help, -h       Show this help

  Examples:
    quickmock                    Open the management dashboard
    quickmock routes.json        Start single server with routes file
    quickmock --port=4000        Management UI on port 4000
    quickmock --init             Generate example routes.json
  `);
  process.exit(0);
}

// ── Init: create example routes file ───────────────
if (args.includes('--init')) {
  const example = {
    resources: {
      users: {
        basePath: '/api/users',
        seed: {
          id: '{{faker.id}}',
          name: '{{faker.name}}',
          email: '{{faker.email}}',
          role: 'user',
          avatar: '{{faker.avatar}}',
          createdAt: '{{faker.date}}',
        },
        count: 5,
      },
      posts: {
        basePath: '/api/posts',
        seed: {
          id: '{{faker.id}}',
          title: '{{faker.title}}',
          body: '{{faker.paragraph}}',
          author: '{{faker.name}}',
          publishedAt: '{{faker.date}}',
        },
        count: 3,
        delay: 200,
      },
    },
    routes: [
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
const routesFile = args.find(a => !a.startsWith('-'));

const portFlag = flags.find(f => f.startsWith('--port='));
const port = portFlag ? (parseInt(portFlag.split('=')[1]) || 3000) : 3000;

const hostFlag = flags.find(f => f.startsWith('--host='));
const host = hostFlag ? (hostFlag.split('=')[1] || 'localhost') : 'localhost';

// ── Decide mode ────────────────────────────────────

if (routesFile) {
  // Legacy single-server mode
  const options: ServerOptions = {
    port,
    host,
    watch: !flags.includes('--no-watch'),
    cors: !flags.includes('--no-cors'),
    delay: 0,
  };
  const delayFlag = flags.find(f => f.startsWith('--delay='));
  if (delayFlag) options.delay = parseInt(delayFlag.split('=')[1]) || 0;

  startServer(routesFile, options).catch((err: Error) => {
    console.error(`\n  Error: ${err.message}\n`);
    process.exit(1);
  });
} else {
  // Management mode
  const server = createManagementServer(port, host);

  server.listen(port, host, () => {
    console.log('');
    console.log(`  ${c.brand('◆  quickmock  ◆')}`);
    console.log(`  ${c.dim('Management dashboard running')}`);
    console.log('');
    console.log(`  ${c.dim('Dashboard')}  ${c.success(`http://${host}:${port}/__dashboard`)}`);
    console.log(`  ${c.dim('API')}        ${c.success(`http://${host}:${port}/__api/servers`)}`);
    console.log('');
    console.log(`  ${c.dim('Open the dashboard to create and manage mock servers.')}`);
    console.log(`  ${c.dim('Or run')} ${chalk.bold('quickmock routes.json')} ${c.dim('for single-server mode.')}`);
    console.log('');
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n  Error: Port ${port} is already in use\n`);
    } else {
      console.error(`\n  Error: ${err.message}\n`);
    }
    process.exit(1);
  });

  process.on('SIGINT', () => {
    console.log(`\n  ${c.dim('Shutting down...')}\n`);
    server.close();
    process.exit(0);
  });
}
