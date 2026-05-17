# pm2ctl

A web dashboard for PM2 process manager. Monitor and manage your PM2 processes from the browser with real-time updates, process controls, log viewer, and more.

![](ui.png)

## Features

- **Dashboard** — Real-time overview of all PM2 processes with status filtering and multi-column sorting
- **Process Controls** — Start, stop, restart, reload, and delete individual processes
- **Process Details** — CPU/memory/uptime metrics, metadata, command-line inspection
- **Live Logs** — View recent stdout/stderr output per process
- **Real-time Updates** — Server-Sent Events push process state changes (2s interval)
- **Process Dump** — Save and restore PM2 process list snapshots
- **Port Detection** — Auto-discover ports your processes are listening on

## Quick Start

Run instantly with npx, no install required:

```bash
npx pm2ctl                    # Start on default port 3456
npx pm2ctl --port 8080        # Custom port
npx pm2ctl --host 127.0.0.1   # Bind to specific address
npx pm2ctl --no-open          # Skip auto-opening browser
npx pm2ctl --help             # Show help
```

Or install globally:

```bash
npm install -g pm2ctl
pm2ctl
```

## Installation from Source

```bash
git clone <repo-url>
cd pm2ctl
npm run install:all
npm run build
```

## CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `--port <port>` | Server port | `3456` |
| `--host <host>` | Bind address | `0.0.0.0` |
| `--no-open` | Don't open browser on start | — |
| `-h, --help` | Show help | — |

## Scripts

```bash
./start.sh                # Start in background (install deps + launch)
./start.sh --build        # Build frontend before starting
./start.sh --no-install   # Skip dependency installation
./stop.sh                 # Stop the server
```

## Development

```bash
# Install all dependencies
npm run install:all

# Start both backend and frontend dev servers (frontend hot-reloads)
npm run dev

# Start backend only
npm run dev:backend

# Start frontend dev server only
npm run dev:frontend

# Build frontend for production
npm run build
```

- Backend: `backend/server.js` — Express + PM2 API
- Frontend: `frontend/` — React + Vite + Tailwind CSS

## API

All endpoints are mounted under `/api`:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/processes` | List all processes |
| GET | `/api/processes/:name` | Get process details |
| POST | `/api/processes/:name/start` | Start a process |
| POST | `/api/processes/:name/stop` | Stop a process |
| POST | `/api/processes/:name/restart` | Restart a process |
| POST | `/api/processes/:name/reload` | Reload a process |
| DELETE | `/api/processes/:name` | Delete a process |
| GET | `/api/processes/:name/logs` | Get log file paths |
| GET | `/api/events` | SSE real-time event stream |
| POST | `/api/dump` | Save process list snapshot |
| POST | `/api/resurrect` | Restore process list snapshot |
| GET | `/api/dump-info` | Snapshot metadata |
| POST | `/api/ports` | Query listening ports by PID |
| GET | `/api/raw-log?path=` | Read log file content |

## Tech Stack

- **Backend** — Node.js + Express + pm2
- **Frontend** — React 19 + React Router + Tailwind CSS + Radix UI + Lucide
- **Build** — Vite + TypeScript

---

Powered by [开点](https://www.kai-dian.com)
