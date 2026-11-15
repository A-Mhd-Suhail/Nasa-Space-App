# Mission Emergency Simulator

**Route:** `/app/contingency` · **Navigation:** sidebar → *Analyse* → **Emergency Simulator** (signed-in users, including the demo workspace).
**Label shown on the page at all times:** `SIMULATED MISSION — NOT LIVE SPACECRAFT CONTROL`.

A 3D decision-support and teaching simulation of lunar-landing contingencies. It never commands, models access to, or certifies anything real. It reuses MoonNav's own pipelines (NAIF SPICE, LOLA terrain horizon, hazard screening, illumination products, the live JPL Horizons cross-check) and its design system and 3D stack (React Three Fiber / three.js). Everything labelled *illustrative* is an assumption you can change, not a measurement.

## 1. What you can do

| Scenario | How to trigger | What you see |
|---|---|---|
| **A. Communication blackout** | preset *2 · Earth communication blackout* (real terrain-caused loss on the Malapert flank), or **Trigger communication blackout** (simulated antenna/pointing anomaly) | `DIRECT COMMUNICATION: LOST` in the scene, a red sight line, the terrain limit that blocks Earth, then the relay check |
| **A′. Relay visibility** | preset *3 · Relay orbiter visibility recovery*; relay altitude/inclination/RAAN/phase sliders | `LANDER → RELAY`, `RELAY → EARTH`, `RELAY COMMUNICATION` each VISIBLE/BLOCKED/AVAILABLE/UNAVAILABLE, coloured lines, a window timeline |
| **B. Overshoot / undershoot / excessive descent velocity / insufficient braking / incorrect thrust duration / combinations** | presets 4–6, the **Trigger …** buttons, or the deviation checkboxes | planned (green), deviated (red dashed) and recovery (blue) trajectories, predicted touchdown, live altitude / velocities / distance / propellant |
| **C. Emergency thruster correction** | **Simulate emergency braking** (retrograde), mode *Vertical braking only*, **Simulate lateral correction** (divert), or *Recover onto the original target* | before/after velocity, required delta-v, propellant used and left, burn time, peak thrust, predicted touchdown, feasible / `RECOVERY NOT FEASIBLE` with the reasons |
| **D. Alternative landing sites** | preset *6 · Alternative landing site selection*, **Evaluate alternative landing sites** | candidate zones on the terrain, mandatory pass/fail/unknown checks per zone, a recommendation only among zones that pass everything, or `NO FEASIBLE ALTERNATIVE LANDING SITE FOUND` |

Presets: 1 Normal lunar descent · 2 Earth communication blackout · 3 Relay orbiter visibility recovery · 4 Excessive horizontal velocity · 5 Emergency braking · 6 Alternative landing site selection. Each one changes the scene immediately and can then be edited.

Controls: Start / Pause / Resume / Replay / Reset, speed (1–30×), timeline slider, camera (rotate, zoom, pan via OrbitControls; *Mission overview*, *Focus lander*, *Focus relay*, *Focus landing zone*), view switch (*Descent (terrain)* / *Orbit (relay)*), vertical exaggeration (1×, 2×, 4×). Every trigger shows a toast stating what it changed; no button is decorative.

## 2. 3D scene

* **Descent view:** the LOLA terrain around the target (real heights from MoonNav's hazard-screening grid, ±6 km, curvature drop included, lit from the SPICE Sun direction), the lander model, the original target ring, candidate zones (green PASS / red FAIL / amber UNVERIFIED), the three trajectories, the predicted touchdown, Earth and Sun direction markers, the direct-Earth sight line (green available / red dashed lost), the terrain-horizon limit along the Earth azimuth (amber dashed), and the relay direction line with range.
* **Orbit view:** the textured Moon (NASA Moon Trek WAC imagery through MoonNav's existing globe texture loader), the landing target, the simulated relay on its orbit ring, Earth and Sun markers, and the three sight lines (lander→relay, relay→Earth, lander→Earth).
* Earth and Sun are labelled *direction, not to scale*. If WebGL is unavailable the page says so and all panels still work. Terrain resolution is stated in the scene caption.

## 3. Scientific method

All formulas are in `src/lib/contingency/` and covered by 57 unit tests.

**Frames.** Moon-fixed body frame (km) and a local east/north/up (ENU) frame at the landing target (m). Azimuth is clockwise from north, elevation above the local horizontal, as everywhere in MoonNav. Terrain-screening grids are in the south-polar stereographic plane and are rotated into ENU by the site longitude.

**Direct Earth visibility (geometric, terrain-aware).** Earth's azimuth/elevation at the target come from SPICE (`spkcpo`, light time + stellar aberration, MOON_ME). The 360° terrain horizon comes from LOLA (curvature-aware, 0.5° azimuth bins, up to 300 km). The lander is *raised* above the site by its altitude: for the blocking terrain point (its angle and distance are in the profile) the elevation seen from the raised observer is recomputed exactly from the sphere geometry (`horizonElevationAtAltitude`). Direct contact is available iff Earth's elevation is at or above `max(terrain horizon at altitude, antenna mask, 0)`. No data in that direction → `unknown`, never clear.

**Lander → relay.** The relay's body-frame position is a circular orbit (altitude, inclination, RAAN, phase) propagated with the lunar GM and rotated into the Moon-fixed frame by the Moon's rotation. The relay direction from the lander is converted to azimuth/elevation and tested against the same terrain horizon (altitude-corrected).

**Relay → Earth.** The segment from the relay along the Earth direction (length = Earth distance) is tested for intersection with the Moon sphere (occultation); a tangent ray is not blocked.

**Relay communication = AVAILABLE only if both legs are visible at the same instant.** `UNKNOWN` if a leg cannot be evaluated and none is blocked. Windows are produced by sampling over time (default 1.5 orbital periods).

**RF is separate and optional.** The *Optional RF link margin* card (off by default) computes free-space path loss, C/N0, Eb/N0 and margin only from values you type: frequency, EIRP, G/T, data rate, required Eb/N0, other losses. It is labelled illustrative and states that a geometric window does not prove a working link.

**Descent dynamics.** Point-mass model in ENU, uniform lunar gravity g = μ/R² = 1.625 m/s² (0.2 % variation over a 3 km descent), thrust acceleration limited by `maxThrust/mass`, propellant by the rocket equation (`ṁ = F/(Isp·g₀)`), velocity-Verlet integration at 0.25 s. The nominal plan is a polynomial (linear-acceleration) guidance solution to the target; the time-to-go with the least peak thrust that keeps thrust upward and altitude ≥ 0 is selected with 15 % thrust margin. Deviations are mid-descent anomalies starting at an onset time: horizontal/vertical speed factors, thrust scale (insufficient braking), burn-schedule stretch (incorrect thrust duration). They fly the **same open-loop schedule** as the plan, so overshoot/undershoot emerge from the physics rather than being drawn.

**Detection and decision.** The lander compares its state to the plan (150 m or 4 m/s); the decision point is the detection time plus a configurable delay (default 3 s).

**Recovery feasibility.** From the decision state the solver searches burn durations T (3 s up to 1.5× the engine limit) for the guidance profile to the aim point and rejects any profile that: needs more than the maximum thrust; needs more sideways thrust than the lateral share allows; needs downward thrust (engines can only push up); dips below the surface; exceeds the maximum burn time; or uses more propellant than is available above the reserve. The least-propellant feasible profile is flown through the integrator (not just evaluated algebraically). If none exists the result is `RECOVERY NOT FEASIBLE` with the dominant violations in plain words. Maneuvers: *retrograde* (aim = horizontal stopping point, zero velocity), *vertical only* (aim = predicted touchdown, horizontal velocity kept — usually unsafe), *lateral divert* (aim = a candidate zone), *recover to target*.

**Alternative sites.** Candidates are well-separated low-slope cells of the LOLA hazard-screening grid around the target (default 6, ≥ 600 m apart, within 3 km), with long-term Sun/Earth visibility and permanent-shadow flags from the LOLA team's illumination products. Mandatory checks: terrain data present, slope ≤ 15°, roughness ≤ 1.5 m, reachable with the remaining divert capability, sunlight ≥ 20 %, Earth visibility ≥ 10 % (the last two switchable). Each check is `pass`, `fail` or `unknown`. Verdict: `FAIL` if any mandatory check fails; `UNVERIFIED` if none fails but one is unknown; `PASS` otherwise. The weighted score (slope margin 30, roughness 15, sunlight 20, Earth 15, propellant left 20) ranks **only** `PASS` zones. If none passes: `NO FEASIBLE ALTERNATIVE LANDING SITE FOUND`.

**State machine.** `NOMINAL_DESCENT → COMMUNICATION_BLACKOUT → AUTONOMOUS_RESPONSE → RELAY_VISIBILITY_CHECK → TRAJECTORY_DEVIATION → RECOVERY_FEASIBILITY_CHECK → ALTERNATIVE_SITE_EVALUATION → SIMULATED_TOUCHDOWN | RECOVERY_FAILURE`. Only the legal edges in `machine.ts` exist; an illegal transition throws. During a blackout the lander does not wait for ground control: the autonomous response state states that it continues on a pre-loaded contingency sequence. If a deviation happens before a blackout, the blackout is reported as a concurrent condition rather than a state.

## 4. Data sources actually used (summary; full detail in `DATA_SOURCE_PROVENANCE.md`)

| Source | Role in this feature |
|---|---|
| NASA Moon Trek (WMTS) | imagery for the orbit-view Moon (LRO WAC mosaic); live tile and capabilities checks recorded on the page |
| NASA JPL Horizons API | independent cross-check of the Sun/Earth directions at the target, shown as pass/warn/fail with the separation; failures reported, never hidden |
| QuickMap (ASU/LROC) | **reference only** — linked; no public data API found, not scraped |
| Canadian Space Agency Moon exploration | **reference only** — explains Gateway/Canadarm3 context; no numbers taken from it |
| NASA LRO LOLA (via MoonNav's science service) | terrain heights, slope, roughness, horizon, illumination, permanent shadow |
| NAIF SPICE | runtime Sun/Earth ephemeris |

## 5. Assumptions and limitations

* **Not live spacecraft control.** All actions are simulated; the simulator cannot command, certify or predict a real mission.
* **Vehicle and relay values are illustrative.** Dry mass, propellant, thrust, Isp, burn limit, lateral share, reserve, descent start state, relay orbit — defaults are teaching values, editable, and are not any real vehicle.
* **Relay is hypothetical.** Circular orbit; NRHO/ELFO/halo orbits (as proposed for Gateway) are not modelled. No Lunar Reconnaissance Orbiter relay capability is assumed and Gateway is treated as future infrastructure only.
* **Terrain at the target only.** The horizon profile is computed at the landing target. A lander displaced a few kilometres sideways would see a different horizon; its altitude is corrected, its lateral offset is not. The altitude correction keeps the same blocking terrain point, which can be optimistic if a more distant ridge becomes limiting.
* **Resolution.** Candidate terrain uses the finest cached LOLA product (stated on the page; 20 m or 240 m posting) resampled to ≤ 60 m cells; boulders and craters smaller than a cell are not assessed. Roughness is stencil-scale, not lander-foot scale.
* **Illumination is long-term.** Sunlight/Earth percentages are 18.6-year averages for the cell, not for the landing date.
* **Dynamics.** Point mass, uniform gravity, no attitude, throttle dynamics, fuel slosh, sensor noise or guidance dispersion. Deviations are step changes at an onset time.
* **Ephemeris at one epoch.** Earth's direction is held fixed during the few-minute descent (it changes by far less than a hundredth of a degree).
* **Geometry is not RF.** A visible leg or relay window does not mean a radio link would close.
* Browser performance depends on WebGL; software rendering is slow but correct.

## 6. Files

| Area | Path |
|---|---|
| Page and client | `src/app/app/contingency/page.tsx`, `src/components/contingency/{ContingencyClient,scene,panels,presets}.tsx` |
| Simulation library | `src/lib/contingency/{geometry,relay,physics,sites,machine,environment,engine}.ts` |
| Environment API | `POST /api/v1/contingency/environment` (signed in, 30/min) |
| Source provenance API | `GET /api/v1/contingency/sources` (public, cached 30 min, refreshes limited to 6/min) and `src/lib/contingency-sources.ts` |
| Tests | `tests/unit/contingency.test.ts` (57), `tests/e2e/contingency.spec.ts` (16 × 3 browsers) |
| Screenshots | `docs/screenshots/contingency/` (regenerate with `scripts/capture-contingency.mjs`) |
