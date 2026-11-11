import { NextResponse } from "next/server";
import { assertWorkspaceAccess, requireApiUser, WS_COOKIE } from "@/lib/dal";
import { route } from "@/lib/http";

/** Select the current workspace for this browser (membership verified; cookie is not trusted on reads either). */
export const POST = route<{ params: Promise<{ workspaceId: string }> }>(async (req, { params }) => {
  const u = await requireApiUser();
  const { workspaceId } = await params;
  await assertWorkspaceAccess(u, workspaceId);
  const res = NextResponse.json({ ok: true, currentId: workspaceId });
  res.cookies.set(WS_COOKIE, workspaceId, { httpOnly: true, sameSite: "lax", path: "/", secure: new URL(req.url).protocol === "https:", maxAge: 60 * 60 * 24 * 365 });
  return res;
});
