import { isDemoUser } from "@/lib/demo";
import { z } from "zod";
import { rateLimit, requireApiUser } from "@/lib/dal";
import { ApiError, json, readJson, route } from "@/lib/http";
import { createInvitation, listInvitations } from "@/lib/invitations";

type Ctx = { params: Promise<{ workspaceId: string }> };

/** List pending invitations for a workspace (any member). */
export const GET = route<Ctx>(async (_req, { params }) => {
  const u = await requireApiUser();
  const { workspaceId } = await params;
  const invitations = await listInvitations(u, workspaceId);
  return json({ invitations: invitations.map((i) => ({ id: i.id, workspaceId: i.workspaceId, email: i.email, role: i.role, invitedBy: i.invitedBy, expiresAt: i.expiresAt.toISOString(), acceptedAt: i.acceptedAt?.toISOString() ?? null, createdAt: i.createdAt.toISOString() })) });
});

/** Create an email invitation (owner only). */
export const POST = route<Ctx>(async (req, { params }, requestId) => {
  const u = await requireApiUser();
  if (isDemoUser(u)) throw new ApiError(403, "demo_restricted", "Demo accounts cannot invite people. Create a free account to collaborate.");
  await rateLimit(`invite:${u.id}`, 20, 60);
  const { workspaceId } = await params;
  const { email, role } = z.object({ email: z.email(), role: z.enum(["editor", "viewer"]) }).parse(await readJson(req));
  const result = await createInvitation(u, workspaceId, email, role, requestId);
  return json(result, 201);
});
