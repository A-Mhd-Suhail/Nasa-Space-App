#!/usr/bin/env bash
# Start a project-local PostgreSQL 17 cluster on port 54329 (no system service). Requires `brew install postgresql@17`.
set -euo pipefail
cd "$(dirname "$0")/.."
PG="${PG_BIN:-/opt/homebrew/opt/postgresql@17/bin}"
export LC_ALL=en_US.UTF-8
if [ ! -d data/pg ]; then
  "$PG/initdb" -D data/pg -U moonnav --auth=trust -E UTF8 --locale=en_US.UTF-8 >/dev/null
fi
if ! "$PG/pg_ctl" -D data/pg status >/dev/null 2>&1; then
  "$PG/pg_ctl" -D data/pg -o "-p 54329 -k /tmp" -l data/pg.log start
  sleep 2
fi
for db in moonnav_dev moonnav_test; do
  "$PG/psql" -h localhost -p 54329 -U moonnav -d postgres -tc "select 1 from pg_database where datname='$db'" | grep -q 1 || "$PG/createdb" -h localhost -p 54329 -U moonnav "$db"
done
echo "PostgreSQL ready on localhost:54329 (moonnav_dev, moonnav_test)"
