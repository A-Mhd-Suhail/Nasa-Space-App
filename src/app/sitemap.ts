import type { MetadataRoute } from "next";

/** Crawlable public pages (workspace, admin and API routes stay private). */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.APP_URL ?? "http://localhost:3100";
  const routes = ["", "/explore", "/learn", "/methodology", "/sources", "/about", "/limitations", "/privacy", "/terms", "/login", "/register"];
  return routes.map((r) => ({ url: `${base}${r}`, lastModified: new Date() }));
}
