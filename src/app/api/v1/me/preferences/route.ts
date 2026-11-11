import { z } from "zod";
import { requireApiUser } from "@/lib/dal";
import { json, readJson, route } from "@/lib/http";
import { DEFAULT_PREFERENCES, repos } from "@/repositories";

const patch = z.object({
  preferredMode: z.enum(["simple", "advanced"]).optional(),
  units: z.enum(["metric"]).optional(),
  timeZone: z.literal("UTC").optional(),
  scoringWeights: z.object({ sun: z.number().min(0).max(100), dte: z.number().min(0).max(100), energy: z.number().min(0).max(100) }).optional(),
  missionThresholds: z.record(z.string().max(40), z.number().min(0).max(1e6).nullable()).optional(),
  display: z.record(z.string().max(40), z.union([z.string().max(200), z.number(), z.boolean()])).optional(),
});

/** The signed-in user's preferences (defaults when none are stored yet). */
export const GET = route(async () => {
  const u = await requireApiUser();
  const p = await repos().preferences.get(u.id);
  return json({ preferences: p ?? { userId: u.id, ...DEFAULT_PREFERENCES, updatedAt: null }, stored: !!p });
});

export const PUT = route(async (req) => {
  const u = await requireApiUser();
  const body = patch.parse(await readJson(req));
  return json({ preferences: await repos().preferences.upsert(u.id, body) });
});
