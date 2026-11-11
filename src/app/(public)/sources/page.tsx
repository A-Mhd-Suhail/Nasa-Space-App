import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import kernels from "../../../../science/catalog/kernels.json";
import mapMeta from "../../../../public/data/map_meta.json";
import { db, schema } from "@/db";
import { Card, CardHeader, DataTag, PageHeader, StatusBadge } from "@/components/ui";

export const metadata: Metadata = { title: "Data sources" };
export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  let products: (typeof schema.dataProducts.$inferSelect)[] = [];
  let dbError = false;
  try {
    products = await db().select().from(schema.dataProducts).orderBy(asc(schema.dataProducts.kind));
  } catch {
    dbError = true;
  }
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6">
      <PageHeader title="Data sources" description="Every product MoonNav uses, with provider, release, licence, frame, units, resolution and processing state. Analyses record the exact product and kernel versions they used." />
      {dbError && <p className="text-sm text-warn">The registry database is unavailable; showing the versioned catalogue files below.</p>}
      <div className="space-y-4">
        {products.map((p) => (
          <Card key={p.id}>
            <CardHeader title={p.productId} subtitle={p.provider} tag={<><StatusBadge status={p.status} /><DataTag kind="measured" /></>} actions={p.sourceUrl ? <a className="text-xs text-accent hover:underline" href={p.sourceUrl} target="_blank" rel="noopener noreferrer">Official source ↗</a> : null} />
            <dl className="grid gap-x-6 gap-y-1.5 px-4 py-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {([
                ["Role", p.kind === "dem" ? "Analysis terrain (horizon, heights)" : p.kind === "ephemeris_kernel_set" ? "Sun/Earth/Moon geometry & frames" : "Feature names & coordinates"],
                ["Mission / instrument", [p.mission, p.instrument].filter(Boolean).join(" / ") || "—"],
                ["Release", p.release],
                ["Format", p.fileFormat ?? "—"],
                ["Frame / CRS", p.crsOrFrame ?? "—"],
                ["Projection", p.projection ?? "—"],
                ["Resolution", p.pixelSpacingM ? `${p.pixelSpacingM} m/pixel` : "—"],
                ["Units / datum", [p.units, p.verticalDatum].filter(Boolean).join(" · ") || "—"],
                ["Coverage", p.coverage ?? "—"],
                ["Licence", p.licenceStatus ?? "—"],
                ["Retrieved", p.retrievedAt?.toISOString().slice(0, 10) ?? "—"],
                ["Delivery", "Cached locally with checksum; computed on request"],
              ] as [string, string][]).map(([k, v]) => (
                <div key={k} className="min-w-0"><dt className="text-xs text-muted">{k}</dt><dd className="break-words text-text-2">{v}</dd></div>
              ))}
            </dl>
            {p.sha256 && <p className="num break-all border-t border-line px-4 py-2 text-xs text-muted">SHA-256 {p.sha256}</p>}
            {p.statusReason && <p className="border-t border-line px-4 py-2 text-xs text-muted">{p.statusReason}</p>}
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader title="SPICE kernel manifest" subtitle={`${kernels.manifestId} · retrieved ${kernels.retrievedAtUtc}`} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted"><tr><th className="px-4 py-2">File</th><th className="px-4 py-2">Type</th><th className="px-4 py-2">Purpose</th><th className="px-4 py-2">SHA-256</th></tr></thead>
            <tbody>
              {kernels.kernels.map((k) => (
                <tr key={k.fileName} className="border-t border-line">
                  <td className="px-4 py-2"><a className="text-accent hover:underline" href={k.sourceUrl} target="_blank" rel="noopener noreferrer">{k.fileName}</a></td>
                  <td className="px-4 py-2 text-text-2">{k.type}</td>
                  <td className="px-4 py-2 text-text-2">{k.purpose}</td>
                  <td className="num px-4 py-2 text-xs text-muted">{k.sha256.slice(0, 16)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-4 py-2 text-xs text-muted">{kernels.citation}</p>
      </Card>
      <Card>
        <CardHeader title="Map layers (visual only)" tag={<DataTag kind="measured" />} subtitle={mapMeta.processing} />
        <ul className="space-y-1 px-4 py-3 text-sm text-text-2">
          {Object.values(mapMeta.layers).map((l) => <li key={l.file}>{l.label} — <span className="num text-xs text-muted">sha256 {l.sha256.slice(0, 16)}…</span></li>)}
          <li className="break-words">Projection: {mapMeta.projection.name}; {mapMeta.projection.formula}</li>
        </ul>
      </Card>
      <Card>
        <CardHeader title="Not connected in this build" tag={<DataTag kind="unavailable" />} />
        <ul className="space-y-1.5 px-4 py-3 text-sm text-text-2">
          <li><strong className="text-text">NASA Moon Trek WMTS</strong> — imagery layers are not integrated; MoonNav’s map layers are derived from LOLA instead.</li>
          <li><strong className="text-text">LROC WAC mosaics</strong> — not used; no optical imagery is shown.</li>
          <li><strong className="text-text">High-resolution local DEMs (5–20 m)</strong> — the reader supports the LOLA polar product family, but only the 240 m product is registered.</li>
          <li><strong className="text-text">JPL Horizons</strong> — used for validation fixtures, not as a live runtime provider.</li>
        </ul>
      </Card>
    </div>
  );
}
