#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$DIR/.go.pid"
LOG_FILE="$DIR/.go.log"

# Kill previous run if pid file exists
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    kill "$OLD_PID" 2>/dev/null || true
    # Wait briefly for clean shutdown
    for i in 1 2 3; do
      kill -0 "$OLD_PID" 2>/dev/null || break
      sleep 0.2
    done
    echo "Stopped previous instance (PID $OLD_PID)"
  fi
  rm -f "$PID_FILE"
fi

# Start Vite dev server, capturing stdout and stderr to log file
cd "$DIR"
npx vite > "$LOG_FILE" 2>&1 &
NEW_PID=$!

# Wait for Vite to be ready (it prints the URL once listening)
for i in $(seq 1 20); do
  if grep -q "Local:" "$LOG_FILE" 2>/dev/null; then
    break
  fi
  sleep 0.3
done

if ! kill -0 "$NEW_PID" 2>/dev/null; then
  echo "Failed to start server. Check $LOG_FILE"
  exit 1
fi

echo "$NEW_PID" > "$PID_FILE"

URL=$(grep -oE 'http://localhost:[0-9]+' "$LOG_FILE" | head -1)
echo "Vite dev server running (PID $NEW_PID)"
echo "  URL: ${URL:-see log}"
echo "  Log: $LOG_FILE"
