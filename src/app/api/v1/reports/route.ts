import { reportInput } from "@/lib/contracts";
import { rateLimit, requireApiUser } from "@/lib/dal";
import { json, readJson, route } from "@/lib/http";
import { createReport, listReports } from "@/lib/services";

export const GET = route(async () => {
  const u = await requireApiUser();
  const rows = await listReports(u);
  return json({ reports: rows.map(({ r, s }) => ({ ...r, storageKey: undefined, scenarioName: s.name })) });
});

export const POST = route(async (req, _ctx, requestId) => {
  const u = await requireApiUser();
  await rateLimit(`report:${u.id}`, 20, 60);
  const { analysisId, format } = reportInput.parse(await readJson(req));
  const r = await createReport(u, analysisId, format, requestId);
  return json({ report: { ...r, storageKey: undefined } }, 201);
});
