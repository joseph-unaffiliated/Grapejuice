#!/usr/bin/env bash
# Capture mobile homepage screenshot from live hosting for visual diff vs Figma/PDF refs.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
URL="${1:-https://grapejuice-pilot.web.app}"

echo "Capturing $URL → $ROOT/assets/live-refs/home-live.png"
npx --yes -p playwright@1.52.0 node "$ROOT/scripts/capture-home-live.mjs" "$URL"
