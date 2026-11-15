# Mission Emergency Simulator — validation

Evidence is from runs on **2026-11-15**. Re-run: `npx vitest run tests/unit/contingency.test.ts` and `npm run test:e2e:stack -- tests/e2e/contingency.spec.ts` (isolated stack; real SPICE/LOLA; the source and Horizons checks need internet).

## 1. Physics assumptions
Point mass in a local ENU frame; uniform lunar gravity g = μ/R² = 1.625 m/s²; thrust acceleration ≤ maxThrust/mass; ṁ = F/(Isp·g₀) with g₀ = 9.80665 m/s²; velocity-Verlet integration, 0.25 s; polynomial (linear-acceleration) guidance. Closed-form checks that the integrator must meet: free fall z(t) = z₀ + v₀t − ½gt² (exact to 1 mm), constant-thrust propellant use, soft touchdown of the nominal plan (< 5 m from target, within speed limits), peak nominal thrust below the vehicle limit with 15 % margin.

## 2. Unit tests (`tests/unit/contingency.test.ts`, 57 tests, all passing)

### Communication
| Case | Expected | Result |
|---|---|---|
| Direct Earth visibility available (Earth 30°, horizon 2°) | `available`, clearance > 20° | pass |
| Direct blocked by terrain (Earth 8°, horizon 12°) | `lost`, reason says terrain | pass |
| Blocked by the antenna mask only | `lost`, reason says mask | pass |
| Injected blackout | `lost`, `forced`, reason says simulated | pass |
| No ephemeris | `unknown`, never visible | pass |
| Relay sees lander **and** Earth | both `visible`, `AVAILABLE` | pass |
| Relay sees lander, **not** Earth (Earth 60° below) | `UNAVAILABLE`, reason names Earth | pass |
| Relay sees Earth, **not** lander (far side) | `UNAVAILABLE`, reason names the lander | pass |
| Neither | `UNAVAILABLE`, "neither leg" | pass |
| Terrain between lander and an above-horizon relay | leg `blocked`, reason terrain | pass |
| Terrain with no data in that direction | `unknown`, not clear sky | pass |
| Windows change over time (500 km polar relay, 2 periods) | ≥ 1 window, not permanent | pass |
| Orbit radius and period (100 km → 118 min) and periodicity | match | pass |
| Raised observer lowers the horizon; matches flat-wall geometry | tan(angle) = (H−z)/d | pass |
| Tangent ray is not occulted; ray into the Moon is | as stated | pass |
| Optional RF: FSPL ≈ 222.6 dB at 384,400 km / 8.4 GHz; 6.02 dB per distance doubling | match | pass |

### Trajectory
Nominal descent lands within limits · overshoot lands > 300 m beyond · undershoot > 300 m short · excessive horizontal velocity → touchdown horizontal speed > 5× limit · excessive vertical velocity → unsafe vertical touchdown · insufficient braking (60 % thrust) unsafe · stretched burn changes the touchdown · **successful correction** (feasible, no violations, flown path ends < 100 m from the target and within speed limits, remaining propellant = mass − dry − used) · **insufficient thrust** (not feasible, reason thrust/lateral) · **insufficient fuel** (not feasible, reason propellant) · **physically infeasible** (60 m altitude, 45 m/s down: not feasible) · retrograde before/after velocity · ballistic touchdown. All pass.

### Alternative landing
Original reachable / unreachable (weak thrust) · alternative passing every mandatory check is recommended · **a steep site is never recommended even with a perfect sun/Earth score** · a failing perfect-score site loses to a passing modest one · site lacking terrain data is `UNVERIFIED` and not recommended · missing illumination makes it unverified unless sunlight/Earth are set advisory · permanently shadowed site fails sunlight · site beyond divert capability fails reachability · no candidates → `NO FEASIBLE ALTERNATIVE LANDING SITE FOUND` · candidates picked from a hazard grid are separated ≥ 600 m and unknown cells are counted. All pass.

### State machine and whole-scenario runs
Illegal transitions and time reversal throw · nominal run history · blackout run walks `NOMINAL_DESCENT → COMMUNICATION_BLACKOUT → AUTONOMOUS_RESPONSE → RELAY_VISIBILITY_CHECK` at t = 40/41/42 s with `lost` from 41 s and `available` at 39 s · deviation run reaches `TRAJECTORY_DEVIATION` and `RECOVERY_FEASIBILITY_CHECK` · starved vehicle with no alternatives ends `RECOVERY_NOT_FEASIBLE` / `RECOVERY_FAILURE` · retrograde and vertical-only maneuvers are judged on their own result (vertical-only cannot give a safe touchdown with sideways speed) · lateral divert with no candidates → no feasible alternative · an impossible vehicle gives an explicit error. All pass.

### Data
Valid ephemeris payload accepted with provenance and the Horizons status · incomplete Earth fields rejected · impossible distance, elevation 120°, NaN rejected · malformed horizon degrades to "no terrain data" (visibility then `unknown`) · the illustrative fallback is `source: "illustrative"`, has no horizon unless hand-set, no Horizons status, provenance "none", and an `ILLUSTRATIVE` note. All pass.

## 3. Real-data results (SPICE, LOLA, live Horizons; 2026-12-01T06:00:00Z)
| Site | Earth az/el | Terrain horizon toward Earth | Direct contact during the descent | Horizons check |
|---|---|---|---|---|
| Mons Malapert summit (−85.99°, 0°E) | 6.8° / +1.99° | −0.80° at the site (blocker 480 m away) | available throughout | pass (≤ 1×10⁻⁶°) |
| Malapert flank (−86.0°, 0°E), 300 m away | 6.8° / +1.98° | +5.86° at the site | available while high, **lost at t ≈ 144 s** as the lander descends | pass |
| Shackleton rim (−89.9°) | 6.8° / −1.89° | −0.49° | Earth below the geometric horizon: lost throughout | pass |
| de Gerlache floor (−88.5°, 273°E) | 93.7° / −2.09° | +9.33° | lost throughout | pass |
The two Malapert rows show how sensitive terrain-aware visibility is to a few hundred metres of position, which is why the page recomputes the horizon for the chosen target rather than reusing a catalogue value.

Candidate zones near the summit (LOLA, 6 zones): slopes 0.7–1.2°, long-term Sun 42–48 %, Earth 73–96 %, none in permanent shadow → all pass the default checks; near de Gerlache they fail sunlight (≈ 0.04–0.3 % Sun, 0 % Earth) — the checks respond to the data.

## 4. Browser tests (`tests/e2e/contingency.spec.ts`, 16 tests, Chromium + Firefox + WebKit)
Anonymous access refused (page → sign-in, API 401/403) · page loads with SPICE data, `Horizons check: pass`, LOLA terrain, a real canvas, nav entry, view and camera buttons, no page errors · normal descent contact holds at the summit · terrain blackout on the flank (AVAILABLE at t = 0, LOST near the end, reason terrain, state log shows blackout and autonomous response) · relay preset (LANDER → RELAY: VISIBLE, RELAY → EARTH: VISIBLE, RELAY COMMUNICATION: AVAILABLE; moving the relay phase to 90° gives UNAVAILABLE and BLOCKED) · each trigger button changes the toast and outcome · overshoot preset yields delta-v, propellant, feasibility · emergency braking result and vertical-only infeasibility · alternative-site preset (candidate rows, a PASS recommended, explainable checks, then propellant 150 kg → `NO FEASIBLE ALTERNATIVE LANDING SITE FOUND`) · action buttons · start/pause/resume/speed/slider/reset · RF margin needs the user's values · four sources with links and live checks, QuickMap and CSA marked REFERENCE ONLY · environment API outage shows ILLUSTRATIVE only · incomplete ephemeris rejected and a Horizons outage reported · phone viewport (390 px) without sideways scrolling.
Final counts: full suite 330 passed / 0 failed on three browsers (110 per browser); `contingency.spec.ts` re-run after the last two small changes 48/48; Vitest 119 passed; science pytest 129 passed. Details in `docs/TESTING.md`.

## 5. Defects found while validating
| Defect | Found by | Fix |
|---|---|---|
| Plan used surface gravity while the integrator used altitude-dependent gravity (21 m / 8.8 m/s error at the end of the nominal plan) | numeric exploration | one uniform gravity in both; documented |
| Deviations applied from t = 0 were "detected" instantly | exploration | deviations start at an onset time |
| Hydration mismatch (WebGL check during server render) and DOM `removeChild` errors from `Html` labels | browser console, E2E | scene loaded client-only; labels drawn as canvas sprites |
| Selected maneuver's result described by the original target's feasibility | review of the outcome text | outcome is judged per selected maneuver |
| 220 px of sideways overflow on phones | mobile E2E | `min-w-0` on grid children, bounded canvas |
| Orbit-view Moon rendered black | screenshot | stronger lights, faint self-illumination, near-black or failed imagery rejected in favour of a grey sphere (the headless screenshot shows the grey fallback when Moon Trek tiles are not drawn) |
| Source-provenance endpoint rate-limited even cached responses | E2E under rapid reloads | only refreshes are limited |
| Env API per-user limit too tight for repeated loads | E2E | 30/min |

## 6. Known limitations
See `MISSION_CONTINGENCY_SIMULATOR.md` §5. Notably: terrain horizon at the target only, relay is a hypothetical circular orbit, vehicle values are illustrative, terrain resolution is stated per run, geometry is not RF availability, and no real spacecraft, relay or Gateway data is used.
