#!/usr/bin/env bash
# First-time local setup on macOS: dependencies, secrets, data, database. Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")/.."
command -v brew >/dev/null || { echo "Homebrew is required: https://brew.sh"; exit 1; }
for f in uv postgresql@17 webp; do brew list --versions "$f" >/dev/null 2>&1 || brew install "$f"; done
npm install
(cd science && uv sync)
if [ ! -f .env.local ]; then
  python3 - <<'PY'
import secrets
open(".env.local", "w").write(f"""APP_URL=http://localhost:3100
BETTER_AUTH_URL=http://localhost:3100
DATABASE_URL=postgres://moonnav@localhost:54329/moonnav_dev
BETTER_AUTH_SECRET={secrets.token_urlsafe(48)}
SCIENCE_API_URL=http://127.0.0.1:8001
SCIENCE_SERVICE_TOKEN={secrets.token_urlsafe(32)}
STORAGE_DRIVER=local
LOCAL_STORAGE_DIR=data/objects
STORAGE_SIGNING_SECRET={secrets.token_urlsafe(48)}
MAIL_DRIVER=outbox
DEV_PLANNER_PASSWORD=Field-{secrets.token_urlsafe(12)}-7
DEV_ADMIN_PASSWORD=Field-{secrets.token_urlsafe(12)}-7
""")
PY
  echo "Created .env.local with fresh local secrets."
fi
./scripts/fetch_data.sh
./scripts/dev-db.sh
npx tsx --env-file=.env.local scripts/migrate.ts
echo "Setup complete. Start everything with: npm run dev:all"
