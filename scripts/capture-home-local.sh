#!/usr/bin/env bash
# Capture homepage from local Expo web dev server (fast visual iteration loop).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${EXPO_WEB_PORT:-8081}"
URL="${1:-http://localhost:${PORT}}"

echo "Waiting for dev server at $URL …"
ready=0
for i in $(seq 1 45); do
  if curl -sf -o /dev/null "$URL" 2>/dev/null; then
    echo "Dev server ready."
    ready=1
    break
  fi
  sleep 1
done
if [[ "$ready" -ne 1 ]]; then
  echo "Dev server not reachable. Start it with: npm run web" >&2
  exit 1
fi

echo "Capturing local homepage → $ROOT/assets/live-refs/"
npx --yes -p playwright@1.52.0 node "$ROOT/scripts/capture-home-live.mjs" "$URL"
