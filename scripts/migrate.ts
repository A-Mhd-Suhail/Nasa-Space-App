/* Apply SQL migrations (drizzle/), then seed catalogue rows idempotently. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import * as schema from "../src/db/schema";

async function main() {
  const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const pool = new Pool({ connectionString: url, max: 1 });
  const db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  console.log("migrations applied");

  // Seed verified sites from the generated catalogue (IAU Gazetteer + LOLA heights).
  const sites = JSON.parse(readFileSync(path.join(process.cwd(), "src/data/sites.json"), "utf8"));
  for (const s of sites.sites) {
    await db
      .insert(schema.sites)
      .values({
        id: s.key, name: s.name, featureType: s.featureType, latitudeDeg: s.latitudeDeg, longitudeEastDeg: s.longitudeEastDeg,
        diameterKm: s.diameterKm, heightM: s.heightM, heightProductId: sites.heightSource, source: s.source, sourceUrl: s.sourceUrl, note: s.note,
      })
      .onConflictDoUpdate({ target: schema.sites.id, set: { name: s.name, latitudeDeg: s.latitudeDeg, longitudeEastDeg: s.longitudeEastDeg, heightM: s.heightM, sourceUrl: s.sourceUrl, note: s.note } });
  }
  console.log(`sites seeded: ${sites.sites.length}`);

  // Seed the data-product registry from the science catalogue + kernel manifest.
  const cat = JSON.parse(readFileSync(path.join(process.cwd(), "science/catalog/products.json"), "utf8"));
  const kern = JSON.parse(readFileSync(path.join(process.cwd(), "science/catalog/kernels.json"), "utf8"));
  const rows = [
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON catalogue rows
    ...cat.products.map((p: Record<string, any>) => ({
      id: p.id, kind: p.kind, provider: p.provider, mission: p.mission ?? null, instrument: p.instrument ?? null, productId: p.productId,
      release: p.release, sourceUrl: p.sourceUrl, licenceStatus: p.licenceStatus, attribution: p.attribution, retrievedAt: p.retrievedAtUtc ? new Date(p.retrievedAtUtc) : null,
      sha256: p.sha256 ?? null, fileFormat: p.fileFormat ?? null, projection: p.projection ?? null, crsOrFrame: p.crsOrFrame ?? null,
      latitudeType: p.latitudeType ?? null, longitudeConvention: p.longitudeConvention ?? null, verticalDatum: p.verticalDatum ?? null, units: p.units ?? null,
      pixelSpacingM: p.pixelSpacingM ?? null, scaleFactor: p.scaleFactor ?? null, offset: p.offset ?? null, noDataValue: p.noDataValue ?? null,
      coverage: p.coverage ?? null, qualityFlags: p.qualityFlags ?? [], processingVersion: p.processingVersion ?? null, status: p.status,
      statusReason: "Seeded from versioned catalogue after checksum + label validation (science/tests)", metadata: p,
    })),
    {
      id: kern.manifestId, kind: "ephemeris_kernel_set", provider: "NASA/JPL NAIF", mission: null, instrument: null, productId: "naif-generic-kernels",
      release: kern.manifestId, sourceUrl: "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/", licenceStatus: "NAIF generic kernels, public; cite NAIF (Acton 1996)",
      attribution: kern.citation, retrievedAt: new Date(kern.retrievedAtUtc), sha256: null, fileFormat: "SPICE kernels (LSK, PCK, BPC, FK, SPK)",
      projection: null, crsOrFrame: "MOON_ME (MOON_ME_DE440_ME421), J2000", latitudeType: null, longitudeConvention: null, verticalDatum: null, units: "km, s",
      pixelSpacingM: null, scaleFactor: null, offset: null, noDataValue: null, coverage: "DE440s span (validated at runtime via spkcov/pckcov)",
      qualityFlags: [], processingVersion: null, status: "approved", statusReason: "Checksums verified at load; cross-checked against JPL Horizons (<0.01 deg)", metadata: kern,
    },
  ];
  for (const r of rows) {
    await db.insert(schema.dataProducts).values(r).onConflictDoNothing();
  }
  console.log(`data products seeded: ${rows.length}`);
  await db.execute(sql`select 1`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
