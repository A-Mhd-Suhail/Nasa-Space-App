import { json, route } from "@/lib/http";
import { resolveInvitationToken } from "@/lib/invitations";

type Ctx = { params: Promise<{ token: string }> };

/**
 * Public preview of an invitation by token (no auth required).
 * Returns 404 when the invitation is invalid/expired/revoked/accepted so the
 * token existence is not revealed.
 */
export const GET = route<Ctx>(async (_req, { params }) => {
  const { token } = await params;
  const resolved = await resolveInvitationToken(token);
  if (!resolved) return json({ error: { code: "not_found", message: "Invitation not found, expired, or already used" } }, 404);
  const { invitation, workspace, inviterName } = resolved;
  return json({
    invitation: {
      workspaceName: workspace.name,
      workspaceId: workspace.id,
      role: invitation.role,
      email: invitation.email,
      expiresAt: invitation.expiresAt.toISOString(),
    },
    inviterName,
  });
});
