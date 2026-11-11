import { requireApiUser } from "@/lib/dal";
import { json, route } from "@/lib/http";
import { revokeInvitation } from "@/lib/invitations";

type Ctx = { params: Promise<{ workspaceId: string; invitationId: string }> };

/** Revoke (cancel) a pending invitation (owner only). */
export const DELETE = route<Ctx>(async (_req, { params }, requestId) => {
  const u = await requireApiUser();
  const { workspaceId, invitationId } = await params;
  await revokeInvitation(u, workspaceId, invitationId, requestId);
  return json({ ok: true });
});
