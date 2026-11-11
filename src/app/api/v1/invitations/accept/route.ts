import { z } from "zod";
import { requireApiUser } from "@/lib/dal";
import { json, readJson, route } from "@/lib/http";
import { acceptInvitation } from "@/lib/invitations";

/** Accept an invitation as the signed-in user. Idempotent. */
export const POST = route(async (req, _ctx, requestId) => {
  const u = await requireApiUser();
  const { token } = z.object({ token: z.string().min(30).max(80) }).parse(await readJson(req));
  const result = await acceptInvitation(u, token, requestId);
  return json({ ok: true, ...result });
});
