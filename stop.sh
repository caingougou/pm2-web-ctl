#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
PIDFILE="$DIR/.server.pid"

if [ -n "$1" ]; then
  PID="$1"
  echo "==> Stopping pm2ctl server (PID $PID)..."
  kill "$PID" 2>/dev/null || echo "Process $PID not found."
  exit 0
fi

if [ -f "$PIDFILE" ]; then
  PID=$(cat "$PIDFILE")
elif PIDS=$(pgrep -f "node.*backend/server.js" 2>/dev/null || true) && [ -n "$PIDS" ]; then
  PID=$(echo "$PIDS" | head -1)
else
  echo "pm2ctl server is not running."
  exit 0
fi

echo "Found pm2ctl server (PID $PID)"
read -p "Stop it? [Y/n] " CONFIRM
case "$CONFIRM" in
  n|N|no|NO) echo "Cancelled."; exit 0 ;;
esac

echo "==> Stopping pm2ctl server (PID $PID)..."
kill "$PID" 2>/dev/null || echo "Process $PID not found."
rm -f "$PIDFILE"
echo "Server stopped."
