import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { json, route } from "@/lib/http";

export const GET = route(async () => {
  const rows = await db().select().from(schema.dataProducts).orderBy(asc(schema.dataProducts.kind));
  return json({ products: rows.map(({ metadata: _m, ...r }) => r) });
});
