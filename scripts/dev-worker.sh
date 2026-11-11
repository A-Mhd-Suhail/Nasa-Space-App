#!/usr/bin/env bash
# Run the analysis worker locally. It leases jobs from the web app's internal job API.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; [ -f .env.local ] && . ./.env.local; set +a
export MOONNAV_INTERNAL_API_URL="${MOONNAV_INTERNAL_API_URL:-${APP_URL:-http://localhost:3000}}"
cd science
exec uv run python -m moonnav_science.worker
