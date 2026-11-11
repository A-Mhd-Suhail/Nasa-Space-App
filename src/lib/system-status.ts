import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";

/** True when PostgreSQL answers within the pool's connection timeout. Never throws. */
export async function databaseReachable(): Promise<boolean> {
  try {
    await db().execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}
