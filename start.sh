#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

cleanup() {
  echo ""
  echo "Stopping all services..."
  kill "$CLIENT_PID" "$SERVER_PID" "$AI_PID" 2>/dev/null
  wait "$CLIENT_PID" "$SERVER_PID" "$AI_PID" 2>/dev/null
  echo "Done."
}
trap cleanup INT TERM

echo "Starting server..."
cd "$ROOT/server" && npm run dev &
SERVER_PID=$!

echo "Starting ai-service..."
cd "$ROOT/ai-service" && .venv/bin/uvicorn src.main:app --reload --port 5007 &
AI_PID=$!

echo "Starting client..."
cd "$ROOT/client" && npm start &
CLIENT_PID=$!

echo ""
echo "All services started:"
echo "  Client    → http://localhost:5005"
echo "  Server    → http://localhost:5006"
echo "  AI Service → http://localhost:5007"
echo ""
echo "Press Ctrl+C to stop all services."

wait
