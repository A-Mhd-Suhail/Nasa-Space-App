import { z } from "zod";
import { rateLimit, requireApiUser } from "@/lib/dal";
import { json, readJson, route } from "@/lib/http";
import { reportDownloadUrl } from "@/lib/services";

const body = z.object({ reportId: z.string().min(1) });

/** Object-scoped, short-lived download URL. Clients never pass raw storage keys. */
export const POST = route(async (req) => {
  const u = await requireApiUser();
  await rateLimit(`presign:${u.id}`, 60, 60);
  const { reportId } = body.parse(await readJson(req));
  return json({ url: await reportDownloadUrl(u, reportId), expiresInSeconds: 300 });
});
