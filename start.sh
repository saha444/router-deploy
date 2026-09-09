#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ROUTER — Start both backend and frontend in development mode
# Usage: ./start.sh
# ─────────────────────────────────────────────────────────────────────────────

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "🚀 Starting ROUTER backend on http://localhost:8000 ..."
PYTHONPATH="$ROOT" python3 -m uvicorn backend.main:app \
  --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

echo "🌐 Starting ROUTER frontend on http://localhost:5173 ..."
cd "$ROOT/frontend" && npm run dev -- --port 5173 &
FRONTEND_PID=$!

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  ROUTER is running                        ║"
echo "║  Frontend:  http://localhost:5173         ║"
echo "║  API docs:  http://localhost:8000/docs    ║"
echo "║  Press Ctrl+C to stop both servers        ║"
echo "╚══════════════════════════════════════════╝"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" SIGINT SIGTERM
wait
