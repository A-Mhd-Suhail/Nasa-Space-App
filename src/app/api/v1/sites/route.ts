import { json, route } from "@/lib/http";
import { repos } from "@/repositories";

/** Curated landing-site catalogue (IAU Gazetteer feature centres with LOLA heights). Public. */
export const GET = route(async () => {
  return json({ sites: await repos().sites.listCatalog(), convention: "planetocentric latitude, east-positive longitude [0,360), MOON_ME" });
});
