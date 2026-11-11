import { isDemoUser } from "@/lib/demo";
import { z } from "zod";
import { rateLimit, requireApiUser } from "@/lib/dal";
import { ApiError, json, readJson, route } from "@/lib/http";
import { addMember, listMembers } from "@/lib/workspaces";

type Ctx = { params: Promise<{ workspaceId: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const u = await requireApiUser();
  const { workspaceId } = await params;
  return json({ members: await listMembers(u, workspaceId) });
});

export const POST = route<Ctx>(async (req, { params }, requestId) => {
  const u = await requireApiUser();
  if (isDemoUser(u)) throw new ApiError(403, "demo_restricted", "Demo accounts cannot add workspace members. Create a free account to collaborate.");
  await rateLimit(`member-add:${u.id}`, 20, 60);
  const { workspaceId } = await params;
  const { email, role } = z.object({ email: z.email(), role: z.enum(["editor", "viewer"]) }).parse(await readJson(req));
  return json(await addMember(u, workspaceId, email, role, requestId));
});
