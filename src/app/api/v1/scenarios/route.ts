import { scenarioInput } from "@/lib/contracts";
import { rateLimit, requireApiUser } from "@/lib/dal";
import { json, readJson, route } from "@/lib/http";
import { createScenario, listWorkspaceScenarios } from "@/lib/services";

/** List saved mission scenarios in the current workspace (newest first) with their latest analysis status. */
export const GET = route(async () => {
  const u = await requireApiUser();
  const rows = await listWorkspaceScenarios(u);
  return json({
    scenarios: rows.map(({ latestAnalysis: a, definition: _d, ...s }) => ({
      ...s,
      latestAnalysis: a ? { id: a.id, status: a.status, quality: a.quality, completedAt: a.completedAt } : null,
    })),
  });
});

export const POST = route(async (req, _ctx, requestId) => {
  const u = await requireApiUser();
  await rateLimit(`scenario:${u.id}`, 60, 60);
  const input = scenarioInput.parse(await readJson(req));
  return json({ scenario: await createScenario(u, input, requestId) }, 201);
});
