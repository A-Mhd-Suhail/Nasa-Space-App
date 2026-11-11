import { json, route } from "@/lib/http";
import { requireApiRole } from "@/lib/dal";
import { listIngestionRuns } from "@/lib/ingestion";

/** List recent ingestion runs (curator+). */
export const GET = route(async (req) => {
  const u = await requireApiRole("curator");
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
  const runs = await listIngestionRuns(u, limit);
  return json({ runs });
});
