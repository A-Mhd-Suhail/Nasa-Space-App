import { z } from "zod";
import { requireApiUser } from "@/lib/dal";
import { json, readJson, route } from "@/lib/http";
import { deleteScenario, getScenario, renameScenario } from "@/lib/services";

type Ctx = { params: Promise<{ scenarioId: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const u = await requireApiUser();
  const { scenarioId } = await params;
  return json({ scenario: await getScenario(u, scenarioId) });
});

/** Rename a scenario. Scientific inputs are immutable; create a new version to change them. */
export const PATCH = route<Ctx>(async (req, { params }, requestId) => {
  const u = await requireApiUser();
  const { scenarioId } = await params;
  const { name } = z.object({ name: z.string().trim().min(1, "Name is required").max(120) }).parse(await readJson(req));
  return json({ scenario: await renameScenario(u, scenarioId, name, requestId) });
});

export const DELETE = route<Ctx>(async (_req, { params }, requestId) => {
  const u = await requireApiUser();
  const { scenarioId } = await params;
  await deleteScenario(u, scenarioId, requestId);
  return json({ ok: true });
});
