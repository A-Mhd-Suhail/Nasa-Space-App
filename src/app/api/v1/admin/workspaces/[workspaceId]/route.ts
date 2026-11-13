import { z } from "zod";
import { requireApiRole } from "@/lib/dal";
import { json, readJson, route } from "@/lib/http";
import { adminDeleteWorkspace } from "@/lib/workspaces";

type Ctx = { params: Promise<{ workspaceId: string }> };

/** Admin-only (MFA enforced by requireApiRole). Requires the exact workspace name and a reason; personal workspaces are refused. */
export const DELETE = route<Ctx>(async (req, { params }, requestId) => {
  const admin = await requireApiRole("admin");
  const { workspaceId } = await params;
  const { confirmName, reason } = z.object({ confirmName: z.string(), reason: z.string().trim().min(3, "Give a reason").max(300) }).parse(await readJson(req));
  return json({ ok: true, removed: await adminDeleteWorkspace(admin, workspaceId, confirmName, reason, requestId) });
});
