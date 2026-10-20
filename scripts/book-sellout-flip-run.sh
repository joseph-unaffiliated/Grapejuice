#!/bin/zsh
# One-shot phase-2 flip runner (launchd). Usage: book-sellout-flip-run.sh <book-id>
set -u
BOOK="${1:?book id required}"
REPO="/Users/joseph/Dropbox/Unaffiliated/Untraditional/grapejuice/pilot-app"
LOG_DIR="$HOME/Library/Logs/grapejuice-flips"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/flip-$BOOK.log"
{
  echo "=== $(date '+%Y-%m-%d %H:%M:%S %Z') flip $BOOK ==="
  cd "$REPO" && /Users/joseph/.local/node22/bin/node scripts/book-sellout-flip.mjs --firebase-cli-login --book "$BOOK" --apply
  echo "exit=$?"
  echo "=== done $(date '+%Y-%m-%d %H:%M:%S %Z') ==="
} >> "$LOG" 2>&1
