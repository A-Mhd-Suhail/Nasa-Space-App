import { json, route } from "@/lib/http";
import { requireApiRole } from "@/lib/dal";
import { getIngestionRun } from "@/lib/ingestion";

type Ctx = { params: Promise<{ runId: string }> };

/** Get a single ingestion run with its full step log (curator+). */
export const GET = route<Ctx>(async (_req, { params }) => {
  const u = await requireApiRole("curator");
  const { runId } = await params;
  const run = await getIngestionRun(u, runId);
  return json({ run });
});
