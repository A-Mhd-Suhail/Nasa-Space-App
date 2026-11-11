#!/usr/bin/env bash
# Run the internal science API locally (FastAPI + SPICE + LOLA). Reads secrets from .env.local.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; [ -f .env.local ] && . ./.env.local; set +a
cd science
exec uv run uvicorn moonnav_science.api:app --host 127.0.0.1 --port "${SCIENCE_PORT:-8001}" "$@"
