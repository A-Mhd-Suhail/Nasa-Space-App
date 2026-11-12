import "server-only";
import { attachDatabasePool } from "@vercel/functions";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/lib/env";
import * as schema from "./schema";

declare global {
  var __moonnavPool: Pool | undefined;
}

function pool(): Pool {
  if (!globalThis.__moonnavPool) {
    // Serverless: every function instance has its own pool, and Supabase's session pooler serves the WHOLE app from a
    // small fixed set of server connections (15 on this project). Keep each instance's share small and short-lived so
    // a burst of instances cannot exhaust it; locally (one process) a bigger pool and a fast failure are better.
    const serverless = !!process.env.VERCEL;
    globalThis.__moonnavPool = new Pool({
      connectionString: env().DATABASE_URL,
      max: Number(process.env.DB_POOL_MAX ?? (serverless ? 3 : 5)),
      idleTimeoutMillis: serverless ? 3_000 : 10_000,
      // Locally: fail fast when PostgreSQL is not running. Serverless: wait for a free pooler connection instead of failing.
      connectionTimeoutMillis: serverless ? 15_000 : 4_000,
    });
    // Vercel Fluid compute: release idle connections before the instance is suspended so they do not stay held.
    if (serverless) attachDatabasePool(globalThis.__moonnavPool);
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
