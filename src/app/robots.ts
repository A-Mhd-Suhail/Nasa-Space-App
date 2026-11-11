import type { MetadataRoute } from "next";

/** Public search-engine policy: marketing pages crawlable, workspace/admin private. */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_URL ?? "http://localhost:3100";
  return {
    rules: [{ userAgent: "*", allow: ["/", "/explore", "/learn", "/methodology", "/sources", "/about", "/limitations", "/privacy", "/terms"], disallow: ["/app", "/admin", "/settings", "/api", "/dev", "/share"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
