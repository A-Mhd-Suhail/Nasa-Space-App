import { describe, expect, it } from "vitest";
import { assessStaleness, type CurrentVersions, rerunKey, type StoredVersions, storedVersionsFrom } from "@/lib/staleness-core";

const stored: StoredVersions = { methodVersion: "m1", softwareVersion: "0.1.0", kernelManifestId: "k1", terrainProductId: "dem", terrainSha256: "aaa" };
const cur = (o: Partial<CurrentVersions> = {}): CurrentVersions => ({
  methodVersion: "m1", kernelManifestId: "k1", terrainProducts: ["dem"],
  products: { dem: { status: "approved", sha256: "aaa" }, k1: { status: "approved", sha256: null } }, ...o,
});

describe("stale-result detection", () => {
  it("is current when every version matches", () => {
    expect(assessStaleness(stored, cur()).state).toBe("current");
  });
  it("is unverified (never 'current') when versions are unavailable", () => {
    expect(assessStaleness(stored, null).state).toBe("unverified");
    expect(assessStaleness(stored, cur({ methodVersion: null })).state).toBe("unverified");
  });
  it("flags method, kernel, DEM checksum and approval changes", () => {
    const s = assessStaleness(stored, cur({ methodVersion: "m2", kernelManifestId: "k2", products: { dem: { status: "deprecated", sha256: "bbb" }, k2: { status: "approved", sha256: null } } }));
    expect(s.state).toBe("stale");
    expect(s.reasons.map((r) => r.field).sort()).toEqual(["kernelManifestId", "methodVersion", "terrainProductStatus", "terrainSha256"]);
  });
  it("flags a terrain product that the service no longer loads", () => {
    const s = assessStaleness(stored, cur({ terrainProducts: ["dem-v3"] }));
    expect(s.reasons[0].field).toBe("terrainProductId");
  });
  it("reads the DEM checksum from the stored summary and builds a version-specific rerun key", () => {
    const sv = storedVersionsFrom({ methodVersion: "m1", softwareVersion: null, kernelManifestId: "k1", terrainProductId: "dem", summary: { provenance: { terrainProduct: { sha256: "aaa" } } } });
    expect(sv.terrainSha256).toBe("aaa");
    expect(rerunKey(cur(), "dem")).toBe("rerun:m1:k1:dem:aaa");
    expect(rerunKey(cur({ methodVersion: "m2" }), "dem")).not.toBe(rerunKey(cur(), "dem"));
  });
});
