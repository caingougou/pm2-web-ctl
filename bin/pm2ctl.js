#!/usr/bin/env node

const { exec } = require('child_process');
const path = require('path');
const { startServer } = require('../backend/server');

const args = process.argv.slice(2);

function showHelp() {
  console.log(`
  pm2ctl - PM2 process manager web UI

  Usage:
    pm2ctl [options]

  Options:
    --port <port>     Server port (default: 3456)
    --host <host>     Server host (default: 0.0.0.0)
    --no-open         Do not open browser automatically
    -h, --help        Show this help message
  `);
  process.exit(0);
}

function parseArgs(args) {
  const options = { port: null, host: null, open: true };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--port':
        options.port = parseInt(args[++i], 10);
        if (isNaN(options.port)) {
          console.error('Error: --port requires a number');
          process.exit(1);
        }
        break;
      case '--host':
        options.host = args[++i];
        break;
      case '--no-open':
        options.open = false;
        break;
      case '-h':
      case '--help':
        showHelp();
        break;
      default:
        console.error(`Unknown option: ${args[i]}`);
        showHelp();
    }
  }
  return options;
}

const options = parseArgs(args);

if (options.port) process.env.PORT = String(options.port);
if (options.host) process.env.HOST = options.host;

const port = parseInt(process.env.PORT || '3456', 10);
const host = process.env.HOST || '0.0.0.0';

startServer({ port, host }).then((server) => {
  const displayHost = host === '0.0.0.0' ? 'localhost' : host;
  const url = `http://${displayHost}:${port}`;

  console.log(`  pm2ctl running at ${url}`);

  if (options.open) {
    console.log('  Opening browser...');
    const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
    exec(`${cmd} ${url}`, (err) => {
      if (err) console.log(`  Could not open browser. Visit ${url} manually.`);
    });
  }

  console.log('  Press Ctrl+C to stop\n');

  function shutdown() {
    console.log('\n  Shutting down...');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}).catch((err) => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
