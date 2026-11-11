import { json, route } from "@/lib/http";
import { requireApiRole } from "@/lib/dal";
import { startIngestion } from "@/lib/ingestion";

type Ctx = { params: Promise<{ productId: string }> };

/**
 * Trigger an ingestion run for a data product (curator+).
 * The run walks discovered → fetching_label → label_parsed → downloading →
 * downloaded → checksum_verified → validated, recording every stage in the
 * data_ingestion_runs.steps log.
 */
export const POST = route<Ctx>(async (req, { params }, requestId) => {
  const u = await requireApiRole("curator");
  const { productId } = await params;
  const run = await startIngestion(u, productId, requestId);
  return json({ run }, 201);
});
