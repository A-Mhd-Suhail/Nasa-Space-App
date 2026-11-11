import { randomUUID } from "node:crypto";
import { db, schema } from "@/db";
import { compare } from "@/lib/compare";
import { compareInput } from "@/lib/contracts";
import { currentWorkspaceId, requireApiUser } from "@/lib/dal";
import { json, readJson, route } from "@/lib/http";
import { summariesFor } from "@/lib/services";

export const POST = route(async (req) => {
  const u = await requireApiUser();
  const input = compareInput.parse(await readJson(req));
  const items = await summariesFor(u, input.analysisIds);
  const result = compare(items, input);
  const id = `cmp_${randomUUID()}`;
  await db().insert(schema.comparisons).values({ id, workspaceId: await currentWorkspaceId(u), analysisIds: input.analysisIds, criteria: { gates: input.gates, weights: input.weights }, result: result as unknown as Record<string, unknown>, createdBy: u.id });
  return json({ comparisonId: id, ...result }, 201);
});
