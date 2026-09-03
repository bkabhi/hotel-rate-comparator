#!/usr/bin/env bash
# Starts a local Temporal dev server (in-memory) on :7233 with the Web UI on :8233.
set -euo pipefail

BIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.bin"

if command -v temporal >/dev/null 2>&1; then
  TEMPORAL_BIN="$(command -v temporal)"
elif [ -x "$BIN_DIR/temporal" ]; then
  TEMPORAL_BIN="$BIN_DIR/temporal"
else
  echo "Temporal CLI not found. Run: npm run temporal:install" >&2
  exit 1
fi

echo "Temporal dev server  ->  grpc localhost:7233   ui http://localhost:8233"
exec "$TEMPORAL_BIN" server start-dev \
  --port 7233 \
  --ui-port 8233 \
  --namespace default \
  --log-level warn
