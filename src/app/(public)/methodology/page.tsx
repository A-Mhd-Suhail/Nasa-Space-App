import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Methodology" };

const S = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
  <Card className="p-5" id={id}>
    <h2 className="text-lg font-semibold">{title}</h2>
    <div className="mt-2 max-w-[72ch] space-y-2 text-sm leading-relaxed text-text-2">{children}</div>
  </Card>
);
const M = ({ children }: { children: React.ReactNode }) => <code className="rounded bg-panel-3 px-1.5 py-0.5 font-mono text-[12.5px] text-text">{children}</code>;

export default function MethodologyPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-10 sm:px-6">
      <PageHeader title="Scientific methods and limitations" description="Method version moonnav-method-1.0.0. How MoonNav turns ephemerides and terrain into visibility states, intervals and optional energy estimates. Full equations and validation evidence are in docs/SCIENTIFIC_METHODS.md in the repository." />
      <S id="coords" title="1. Coordinates, frames and time">
        <p>Sites use planetocentric latitude (north positive) and east-positive longitude in [0°, 360°). West-positive input is converted explicitly. The body-fixed frame is <M>MOON_ME</M>, which the NAIF kernel <M>moon_de440_250416.tf</M> defines as <M>MOON_ME_DE440_ME421</M> — aligned with the DE421 mean-Earth/polar-axis frame that the LOLA gridded products use, so terrain and ephemeris share one frame.</p>
        <p>Heights are radii relative to a 1737.4 km sphere (the LOLA reference). The observer sits on the bilinearly interpolated LOLA surface plus a configurable height (default 2 m).</p>
        <p>Times are entered and reported in UTC. Internally SPICE converts UTC to TDB with the <M>naif0012.tls</M> leap-second kernel; timestamps without a <M>Z</M> are rejected.</p>
      </S>
      <S id="ephemeris" title="2. Sun and Earth geometry">
        <p>For each timestamp, <M>spkcpo</M> returns the vector from the fixed surface site to the Sun or Earth in <M>MOON_ME</M>, with light-time and stellar-aberration correction (<M>LT+S</M>, apparent geometry). Lunar orientation, including physical libration, comes from the binary PCK <M>moon_pa_de440_200625.bpc</M>; positions from <M>de440s.bsp</M>. No fixed-obliquity shortcut is used.</p>
        <p>The vector is rotated into local East-North-Up: <M>horizontal = √(E² + N²)</M>, <M>azimuth = atan2(E, N) mod 360</M>, <M>elevation = atan2(U, horizontal)</M>. At exactly 90°S, “north” follows the site’s longitude meridian.</p>
        <p><strong className="text-text">Validation:</strong> for three sites (pole, Mons Mouton, a rim point) and 15 epochs each, MoonNav’s Sun and Earth azimuth/elevation agree with independent JPL Horizons observer tables to better than 0.01° (automated test).</p>
      </S>
      <S id="terrain" title="3. Terrain and horizon">
        <p>The DEM is LOLA <M>LDEM_75S_240M</M> (PDS, product version 2.0): a 3812 × 3812 polar stereographic grid, 16-bit heights × 0.5 m, 240 m pixels. The reader validates the PDS3 label keywords, file size and SHA-256 before use. Locations outside 75°S–90°S are no-data — never zero.</p>
        <p>The horizon is traced along great circles in 0.5° azimuth bins out to 300 km, sampling every 240 m. Each sample is placed at its true 3D position (reference radius + LOLA height), so <strong className="text-text">lunar curvature is included</strong>; the horizon at an azimuth is the maximum elevation angle along the ray. Rays that leave coverage are flagged “truncated” and carry an upper bound computed for hypothetical terrain 11 km high (above any lunar topography) beyond the edge.</p>
      </S>
      <S id="visibility" title="4. Visibility states and intervals">
        <p>The Sun (radius 695,700 km) and Earth (equatorial radius from <M>pck00011.tpc</M>) are treated as disks. With centre elevation <M>e</M>, apparent radius <M>r</M> and horizon <M>h</M>: visible if <M>e − r ≥ h</M>; partial if the disk straddles <M>h</M>; terrain-blocked if <M>e + r ≤ h</M> with <M>e + r &gt; 0</M>; below horizon if <M>e + r ≤ min(h, 0)</M>; unknown when the decision would change if unseen terrain beyond coverage reached its bound.</p>
        <p>The rule that counts as “lit” is explicit: any part of the disk (default), full disk, or centre point. The visible fraction of a partly hidden disk uses the circular-segment area above a locally straight horizon line.</p>
        <p>The interval is sampled at the chosen step; every state change is then refined by bisection to the chosen tolerance (default 10 s). Sensitivity tests at 60 min, 15 min and 5 min steps agree within one minute once refined.</p>
      </S>
      <S id="power" title="5. Optional solar-panel energy (modelled)">
        <p>Only when the user supplies area, efficiency, derating and orientation: <M>P = S·A·η·max(0, n̂·ŝ)·f_vis·derating</M>, with <M>S = 1361 W/m² × (1 AU / r_sun)²</M>, capped at an optional maximum output, integrated with the trapezoidal rule. Without those inputs MoonNav reports sunlight hours only — never watt-hours. Temperature, dust, storage and electrical losses beyond the derating factor are not modelled.</p>
      </S>
      <S id="dte" title="6. Geometric direct-to-Earth visibility">
        <p>Earth uses the same frame and terrain comparison as the Sun. A geometric DTE window requires Earth to be visible under the selected disk rule and, if configured, its centre to be above the antenna minimum-elevation mask. This is line-of-sight geometry only; no RF link budget is computed.</p>
      </S>
      <S id="compare" title="7. Comparison and quality">
        <p>Comparisons first check that analyses share the time span, step, terrain product, kernel set, method version, visibility rules and antenna mask. Hard gates (minimum sunlit fraction, minimum DTE fraction, maximum unknown fraction) are applied next; only then are optional weights used. If inputs are incompatible, ranking is withheld.</p>
        <p>Quality is rule-based, not a fabricated confidence: <em>medium</em> for the 240 m DEM with full horizon coverage and no unknown samples, <em>low</em> with under 5% unknown samples, otherwise <em>insufficient</em>. <em>High</em> is reserved for DEMs of 20 m or better, which this build does not yet ingest.</p>
      </S>
      <S id="out-of-scope" title="8. Out of scope">
        <p>Landing hazards (slopes and rocks at lander scale), thermal environment, regolith properties, RF link budgets, orbital access and mission operations are not assessed. MoonNav does not select NASA-approved landing sites.</p>
      </S>
    </div>
  );
}
