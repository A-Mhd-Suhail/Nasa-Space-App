import "server-only";
import { db, schema } from "@/db";
import { scienceHealth } from "./science";
import { assessStaleness, type CurrentVersions, storedVersionsFrom } from "./staleness-core";

/** Versions the science service runs now, plus registry approval state. Null when unavailable. */
export async function currentVersions(): Promise<CurrentVersions | null> {
  const h = (await scienceHealth()) as { status: string; methodVersion?: string; kernels?: { manifestId?: string }; terrain?: { products?: string[] } };
  if (h.status === "unavailable" || !h.methodVersion) return null;
  const rows = await db().select({ id: schema.dataProducts.id, status: schema.dataProducts.status, sha256: schema.dataProducts.sha256 }).from(schema.dataProducts);
  return {
    methodVersion: h.methodVersion ?? null,
    kernelManifestId: h.kernels?.manifestId ?? null,
    terrainProducts: h.terrain?.products ?? [],
    products: Object.fromEntries(rows.map((r) => [r.id, { status: r.status, sha256: r.sha256 }])),
  };
}

export async function stalenessFor(a: typeof schema.analyses.$inferSelect, current?: CurrentVersions | null) {
  if (a.status !== "completed") return null;
  return assessStaleness(storedVersionsFrom(a), current === undefined ? await currentVersions() : current);
}
