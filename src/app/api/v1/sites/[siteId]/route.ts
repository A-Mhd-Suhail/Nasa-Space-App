import { json, notFound, route } from "@/lib/http";
import { repos } from "@/repositories";

export const GET = route<{ params: Promise<{ siteId: string }> }>(async (_req, { params }) => {
  const { siteId } = await params;
  const s = await repos().sites.getCatalog(siteId);
  if (!s) throw notFound("Site");
  return json({ site: s });
});
