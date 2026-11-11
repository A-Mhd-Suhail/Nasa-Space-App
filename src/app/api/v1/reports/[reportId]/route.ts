import { requireApiUser } from "@/lib/dal";
import { json, route } from "@/lib/http";
import { getReport, reportDownloadUrl } from "@/lib/services";

export const GET = route<{ params: Promise<{ reportId: string }> }>(async (_req, { params }) => {
  const u = await requireApiUser();
  const { reportId } = await params;
  const r = await getReport(u, reportId);
  return json({ report: { ...r, storageKey: undefined }, downloadUrl: await reportDownloadUrl(u, reportId), downloadUrlExpiresInSeconds: 300 });
});
