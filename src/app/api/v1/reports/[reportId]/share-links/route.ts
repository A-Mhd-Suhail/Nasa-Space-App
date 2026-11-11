import { z } from "zod";
import { rateLimit, requireApiUser } from "@/lib/dal";
import { env } from "@/lib/env";
import { json, readJson, route } from "@/lib/http";
import { createShareLink, listShareLinks } from "@/lib/services";

type Ctx = { params: Promise<{ reportId: string }> };
const body = z.object({ expiresInHours: z.number().int().min(1).max(720).default(72) });

export const GET = route<Ctx>(async (_req, { params }) => {
  const u = await requireApiUser();
  const { reportId } = await params;
  const rows = await listShareLinks(u, reportId);
  return json({ shareLinks: rows.map(({ tokenHash: _t, ...r }) => r) });
});

export const POST = route<Ctx>(async (req, { params }, requestId) => {
  const u = await requireApiUser();
  await rateLimit(`share:${u.id}`, 20, 60);
  const { reportId } = await params;
  const { expiresInHours } = body.parse(await readJson(req));
  const s = await createShareLink(u, reportId, expiresInHours, requestId);
  // The token is shown once; only its hash is stored.
  return json({ id: s.id, url: `${env().APP_URL}/share/${s.token}`, expiresAt: s.expiresAt, scope: "report:read" }, 201);
});
