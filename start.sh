#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
PIDFILE="$DIR/.server.pid"
BUILD=false
SKIP_INSTALL=false

for arg in "$@"; do
  case "$arg" in
    --build|-b) BUILD=true ;;
    --no-install) SKIP_INSTALL=true ;;
  esac
done

if [ "$SKIP_INSTALL" = false ]; then
  echo "==> Installing dependencies..."
  npm install --prefix "$DIR" --silent
  npm install --prefix "$DIR/backend" --silent
  npm install --prefix "$DIR/frontend" --silent
fi

if [ "$BUILD" = true ]; then
  echo "==> Building frontend..."
  cd "$DIR/frontend" && npx vite build
fi

echo "==> Starting server on http://localhost:3456"
nohup node "$DIR/backend/server.js" > "$DIR/.server.log" 2>&1 &
echo $! > "$PIDFILE"
echo "Server started (PID $(cat $PIDFILE))"
sleep 1 && open http://localhost:3456
