#!/usr/bin/env bash
# Download Figma home reference (node 370:2949) into assets/mockup-refs/
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/assets/mockup-refs/figma-home-370-2949.png"
mkdir -p "$ROOT/assets/mockup-refs"

if [[ -f "$OUT" ]]; then
  echo "Figma reference already exists: $OUT"
  exit 0
fi

echo "Fetch figma-home-370-2949.png via Cursor Figma MCP (get_screenshot fileKey=rGzXYb1rNVxqGHz81835Jn nodeId=370:2949)"
echo "Or place a PNG manually at: $OUT"
exit 1
