#!/bin/bash

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_FILE="$REPO_DIR/logs/poll-batch.log"

echo "======================================" >> "$LOG_FILE"
echo "Poll-batch started: $(date)" >> "$LOG_FILE"

load_env() {
  local file="$1"
  while IFS='=' read -r key value; do
    [[ "$key" =~ ^[[:space:]]*# ]] && continue
    [[ -z "${key// }" ]] && continue
    key="${key#"${key%%[![:space:]]*}"}"
    key="${key%"${key##*[![:space:]]}"}"
    export "$key=$value"
  done < "$file"
}

if [ -f "$REPO_DIR/.env.local" ]; then
  load_env "$REPO_DIR/.env.local"
  echo "Loaded env from .env.local" >> "$LOG_FILE"
elif [ -f "$REPO_DIR/.env" ]; then
  load_env "$REPO_DIR/.env"
  echo "Loaded env from .env" >> "$LOG_FILE"
else
  echo "ERROR: No .env or .env.local found at $REPO_DIR" >> "$LOG_FILE"
  exit 1
fi

cd "$REPO_DIR"
npx ts-node src/poll-batch.ts >> "$LOG_FILE" 2>&1
EXIT_CODE=$?

echo "Poll-batch finished: $(date) (exit code: $EXIT_CODE)" >> "$LOG_FILE"
exit $EXIT_CODE
