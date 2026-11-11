import { requireApiUser } from "@/lib/dal";
import { json, route } from "@/lib/http";
import { revokeShareLink } from "@/lib/services";

export const DELETE = route<{ params: Promise<{ shareId: string }> }>(async (_req, { params }, requestId) => {
  const u = await requireApiUser();
  const { shareId } = await params;
  await revokeShareLink(u, shareId, requestId);
  return json({ ok: true });
});
