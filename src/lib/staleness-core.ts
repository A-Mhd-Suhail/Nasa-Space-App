/**
 * Version-aware stale-result detection (pure logic, shared by server and tests).
 *
 * A stored analysis is compared with the versions the science service currently runs.
 * If the current versions cannot be read, the result is "unverified" — never "fresh".
 */

export type CurrentVersions = {
  methodVersion: string | null;
  kernelManifestId: string | null;
  terrainProducts: string[];
  /** data_products rows keyed by id: approval status and checksum. */
  products: Record<string, { status: string; sha256: string | null }>;
};

export type StoredVersions = {
  methodVersion: string | null;
  softwareVersion: string | null;
  kernelManifestId: string | null;
  terrainProductId: string | null;
  terrainSha256: string | null;
};

export type StaleReason = { field: string; label: string; stored: string | null; current: string | null; impact: "results_may_change" | "informational" };

export type Staleness =
  | { state: "current"; reasons: []; checkedAt: string }
  | { state: "stale"; reasons: StaleReason[]; checkedAt: string }
  | { state: "unverified"; reasons: []; checkedAt: string; message: string };

export function storedVersionsFrom(a: { methodVersion: string | null; softwareVersion: string | null; kernelManifestId: string | null; terrainProductId: string | null; summary: unknown }): StoredVersions {
  const prov = (a.summary as { provenance?: { terrainProduct?: { sha256?: string } } } | null)?.provenance;
  return {
    methodVersion: a.methodVersion,
    softwareVersion: a.softwareVersion,
    kernelManifestId: a.kernelManifestId,
    terrainProductId: a.terrainProductId,
    terrainSha256: prov?.terrainProduct?.sha256 ?? null,
  };
}

export function assessStaleness(s: StoredVersions, c: CurrentVersions | null, now = new Date()): Staleness {
  const checkedAt = now.toISOString();
  if (!c || !c.methodVersion || !c.kernelManifestId) {
    return { state: "unverified", reasons: [], checkedAt, message: "The science service did not report its current versions, so freshness cannot be confirmed." };
  }
  const reasons: StaleReason[] = [];
  if (s.methodVersion !== c.methodVersion) {
    reasons.push({ field: "methodVersion", label: "Scientific method version", stored: s.methodVersion, current: c.methodVersion, impact: "results_may_change" });
  }
  if (s.kernelManifestId !== c.kernelManifestId) {
    reasons.push({ field: "kernelManifestId", label: "SPICE kernel set", stored: s.kernelManifestId, current: c.kernelManifestId, impact: "results_may_change" });
  }
  const tp = s.terrainProductId;
  if (tp) {
    const reg = c.products[tp];
    if (!c.terrainProducts.includes(tp)) {
      reasons.push({ field: "terrainProductId", label: "Terrain (DEM) product", stored: tp, current: c.terrainProducts.join(", ") || null, impact: "results_may_change" });
    } else if (reg && reg.status !== "approved") {
      reasons.push({ field: "terrainProductStatus", label: "Terrain product approval", stored: "approved", current: reg.status, impact: "results_may_change" });
    }
    if (reg?.sha256 && s.terrainSha256 && reg.sha256 !== s.terrainSha256) {
      reasons.push({ field: "terrainSha256", label: "Terrain file checksum", stored: s.terrainSha256, current: reg.sha256, impact: "results_may_change" });
    }
  }
  if (c.products[s.kernelManifestId ?? ""]?.status && c.products[s.kernelManifestId ?? ""].status !== "approved") {
    reasons.push({ field: "kernelManifestStatus", label: "Kernel set approval", stored: "approved", current: c.products[s.kernelManifestId ?? ""].status, impact: "results_may_change" });
  }
  return reasons.length ? { state: "stale", reasons, checkedAt } : { state: "current", reasons: [], checkedAt };
}

/** Idempotency suffix for a deliberate re-run under the current versions. */
export function rerunKey(c: CurrentVersions, terrainProductId: string): string {
  return `rerun:${c.methodVersion}:${c.kernelManifestId}:${terrainProductId}:${c.products[terrainProductId]?.sha256 ?? "nosha"}`;
}
