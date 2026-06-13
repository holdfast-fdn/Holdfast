#!/usr/bin/env bash
# Launch the @HoldfastGM service. Config (incl. the bot token and role keys)
# is loaded from an env file OUTSIDE the repo — never commit secrets.
#
#   gm/scripts/run-bot.sh            # uses ~/holdfast/gm.env
#   ENV_FILE=/path/to/env gm/scripts/run-bot.sh
set -euo pipefail

ENV_FILE="${ENV_FILE:-$HOME/holdfast/gm.env}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "missing env file: $ENV_FILE (see gm/README.md)" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

cd "$(dirname "$0")/.."
exec npx tsx src/index.ts
