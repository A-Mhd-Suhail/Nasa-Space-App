import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/lib/env";
import * as schema from "./schema";

declare global {
  var __moonnavPool: Pool | undefined;
}

function pool(): Pool {
  if (!globalThis.__moonnavPool) {
    globalThis.__moonnavPool = new Pool({
      connectionString: env().DATABASE_URL,
      max: Number(process.env.DB_POOL_MAX ?? 5),
      idleTimeoutMillis: 10_000,
      // Fail fast (instead of hanging every request) when PostgreSQL is not running.
      connectionTimeoutMillis: 4_000,
    });
  }
  return globalThis.__moonnavPool;
}

export type DB = NodePgDatabase<typeof schema>;
let _db: DB | null = null;

export function db(): DB {
  if (!_db) _db = drizzle(pool(), { schema });
  return _db;
}

export { schema };
