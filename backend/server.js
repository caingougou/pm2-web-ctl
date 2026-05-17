const express = require('express');
const cors = require('cors');
const fs = require('fs');
const { execSync } = require('child_process');
const pm2 = require('pm2');
const path = require('path');

function pm2Action(fn) {
  return (req, res, next) => {
    fn(req, res, (err) => {
      if (err) return next(err);
    });
  };
}

function getProcessTree(rootPid, maxDepth) {
  if (maxDepth === undefined) maxDepth = 3;
  const seen = new Set([rootPid]);
  const queue = [{ pid: rootPid, depth: 0 }];
  while (queue.length > 0) {
    const entry = queue.shift();
    if (entry.depth >= maxDepth) continue;
    try {
      const out = execSync('pgrep -P ' + entry.pid + ' 2>/dev/null', { timeout: 2000, encoding: 'utf-8' });
      for (const child of out.trim().split('\n')) {
        const c = parseInt(child);
        if (c && !seen.has(c)) {
          seen.add(c);
          queue.push({ pid: c, depth: entry.depth + 1 });
        }
      }
    } catch {}
  }
  return [...seen];
}

function createApp() {
  const app = express();

  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());

  const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
  app.use(express.static(frontendDist));

  app.get('/api/processes', pm2Action((req, res) => {
    pm2.list((err, list) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ data: list });
    });
  }));

  app.get('/api/processes/:name', pm2Action((req, res) => {
    pm2.describe(req.params.name, (err, list) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!list || list.length === 0) {
        return res.json({ data: null, error: 'Process not found' });
      }
      res.json({ data: list[0] });
    });
  }));

  app.post('/api/processes/:name/start', pm2Action((req, res) => {
    pm2.start(req.params.name, (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: `Started ${req.params.name}` });
    });
  }));

  app.post('/api/processes/:name/stop', pm2Action((req, res) => {
    pm2.stop(req.params.name, (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: `Stopped ${req.params.name}` });
    });
  }));

  app.post('/api/processes/:name/restart', pm2Action((req, res) => {
    pm2.restart(req.params.name, (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: `Restarted ${req.params.name}` });
    });
  }));

  app.post('/api/processes/:name/reload', pm2Action((req, res) => {
    pm2.reload(req.params.name, (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: `Reloaded ${req.params.name}` });
    });
  }));

  app.delete('/api/processes/:name', pm2Action((req, res) => {
    pm2.delete(req.params.name, (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: `Deleted ${req.params.name}` });
    });
  }));

  app.get('/api/processes/:name/logs', pm2Action((req, res) => {
    pm2.describe(req.params.name, (err, list) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!list || list.length === 0) {
        return res.json({ data: null, error: 'Process not found' });
      }
      const pm2_env = list[0].pm2_env || {};
      res.json({
        data: {
          out_log: pm2_env.pm_out_log_path,
          err_log: pm2_env.pm_err_log_path,
          log_size: pm2_env.pm_log_size,
        },
      });
    });
  }));

  app.get('/api/events', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    let interval;
    let closed = false;

    const sendProcesses = () => {
      if (closed) return;
      pm2.list((err, list) => {
        if (closed) return;
        if (err) {
          res.write(`data: []\n\n`);
          return;
        }
        res.write(`data: ${JSON.stringify(list)}\n\n`);
      });
    };

    sendProcesses();
    interval = setInterval(sendProcesses, 2000);

    req.on('close', () => {
      closed = true;
      clearInterval(interval);
    });
  });

  app.post('/api/dump', pm2Action((req, res) => {
    pm2.dump((err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Process list saved to dump file' });
    });
  }));

  app.post('/api/resurrect', pm2Action((req, res) => {
    pm2.resurrect((err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Processes restored from dump file' });
    });
  }));

  app.get('/api/dump-info', pm2Action((req, res) => {
    const dumpPath = path.join(process.env.PM2_HOME || path.join(require('os').homedir(), '.pm2'), 'dump.pm2');
    try {
      const stat = fs.statSync(dumpPath);
      const content = fs.readFileSync(dumpPath, 'utf-8');
      let processes = [];
      try {
        processes = JSON.parse(content);
      } catch {}
      res.json({
        data: {
          exists: true,
          modified: stat.mtime,
          size: stat.size,
          process_count: Array.isArray(processes) ? processes.length : 0,
          path: dumpPath,
        },
      });
    } catch {
      res.json({ data: { exists: false, path: dumpPath } });
    }
  }));

  app.post('/api/ports', express.json(), (req, res) => {
    const pids = req.body.pids;
    if (!Array.isArray(pids)) {
      return res.status(400).json({ error: 'pids must be an array' });
    }
    const result = {};
    for (const pid of pids) {
      if (!pid || pid <= 0) continue;
      try {
        const tree = getProcessTree(pid);
        const pidList = tree.join(',');
        const cmd = 'lsof -a -p ' + pidList + ' -iTCP -sTCP:LISTEN -n -P 2>/dev/null';
        const output = execSync(cmd, { timeout: 5000, encoding: 'utf-8' });
        const seen = new Set();
        const ports = [];
        for (const line of output.split('\n').slice(1)) {
          const parts = line.trim().split(/\s+/);
          const addr = parts[parts.length - 2];
          if (addr && addr.includes(':')) {
            const lastColon = addr.lastIndexOf(':');
            const portStr = addr.slice(lastColon + 1);
            const port = parseInt(portStr);
            if (port && !isNaN(port) && !seen.has(port)) {
              seen.add(port);
              let host = addr.slice(0, lastColon);
              if (host.includes('*') || host === '[::]' || host === '::') {
                host = '0.0.0.0';
              } else if (host === '[::1]' || host === '::1') {
                host = '127.0.0.1';
              } else if (host.startsWith('[') && host.endsWith(']')) {
                host = host.slice(1, -1);
              }
              ports.push({ port, host });
            }
          }
        }
        if (ports.length > 0) result[pid] = ports;
      } catch {
      }
    }
    res.json({ data: result });
  });

  app.get('/api/raw-log', (req, res) => {
    const filePath = req.query.path;
    if (!filePath || typeof filePath !== 'string') {
      return res.status(400).json({ error: 'Missing path parameter' });
    }
    const maxBytes = 50000;
    try {
      const stat = fs.statSync(filePath);
      const start = Math.max(0, stat.size - maxBytes);
      const stream = fs.createReadStream(filePath, { start, end: stat.size });
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      stream.pipe(res);
    } catch {
      res.status(200).send('Log file not accessible');
    }
  });

  app.use((err, req, res, _next) => {
    console.error('API Error:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  });

  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });

  return app;
}

function startServer(options) {
  const port = options.port || parseInt(process.env.PORT || '3456', 10);
  const host = options.host || process.env.HOST || '0.0.0.0';

  return new Promise((resolve, reject) => {
    pm2.connect((err) => {
      if (err) {
        reject(new Error('Failed to connect to PM2 daemon: ' + err.message));
        return;
      }
      const app = createApp();
      const server = app.listen(port, host, () => {
        resolve(server);
      });
      server.on('error', reject);
    });
  });
}

module.exports = { startServer, createApp };

// Allow running directly: node backend/server.js
if (require.main === module) {
  const PORT = process.env.PORT || 3456;
  const HOST = process.env.HOST || '0.0.0.0';
  startServer({ port: parseInt(PORT, 10), host: HOST }).then(() => {
    const displayHost = HOST === '0.0.0.0' ? 'localhost' : HOST;
    console.log(`pm2ctl server running on http://${displayHost}:${PORT}`);
  }).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
