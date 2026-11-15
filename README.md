[MoonNav_README.md](https://github.com/user-attachments/files/34880856/MoonNav_README.md)
# MoonNav --- Real-Time Lunar Mission Emergency Response & Recovery System

> **A lunar mission decision-support prototype for exploring what to do
> when a landing mission does not go according to plan.**

MoonNav brings lunar terrain analysis, Sun and Earth visibility,
mission-scenario planning, and interactive emergency simulations into
one platform. Its central goal is to help mission planners **evaluate
possible responses to unexpected conditions during lunar descent and
landing**, especially near the Moon's South Pole.

**Project:** NASA Space Apps Challenge 2026\
**Type:** Independent research and educational prototype\
**Important:** MoonNav is not NASA-owned, NASA-endorsed,
flight-certified, or connected to an operational spacecraft. It does not
issue commands to a real lander, orbiter, rover, or propulsion system.
Emergency actions and spacecraft behaviour in the prototype are
simulations for decision-support and demonstration.

------------------------------------------------------------------------

## The problem

Lunar landing missions are planned using scientific observations,
terrain datasets, predicted trajectories, spacecraft models, and
carefully prepared procedures. Those preparations are essential, but
actual mission conditions can still differ from predictions.

During descent, a mission may face unexpected conditions such as:

-   Direct communication with Earth becoming unavailable because of
    terrain obstruction or changing geometry.
-   A lander deviating from its planned trajectory or approaching the
    surface with an unsafe velocity.
-   The original landing zone becoming unreachable or unsuitable.
-   Uncertainty about the lander's position or nearby hazards.

In these moments, mission teams need to understand the situation and
rapidly assess what options may be available.

**The challenge is not simply a lack of existing data. It is that
unexpected situations cannot always be fully anticipated by pre-mission
planning and static predictions alone.** MoonNav explores how scientific
data, changing geometric conditions, and transparent simulations can
help mission planners assess possible contingencies.

## Our solution

MoonNav is a web-based lunar mission decision-support platform. It
combines terrain-aware analysis and interactive 3D visualisation with
simulated emergency scenarios. Users can explore a mission, introduce a
contingency, inspect the resulting conditions, and compare possible
responses.

### 1. Communication resilience through a simulated orbital relay

When direct lander-to-Earth visibility is blocked, MoonNav can evaluate
a possible alternative route through a **simulated lunar relay
spacecraft**:

**Lander → Orbital Relay → Earth**

The simulation checks two separate geometric conditions:

1.  Whether the relay has line of sight to the lander.
2.  Whether the relay has line of sight to Earth.

A relay path is shown as geometrically available only when both
conditions are satisfied at the same time. The 3D view can illustrate
the lander, Earth, relay position, visibility lines, and terrain
obstruction, helping users understand when a communication opportunity
may exist.

A geometric visibility opportunity does **not** guarantee an operational
radio link. Real communication also depends on compatible radios,
antennas, frequencies, power, pointing, link margin, and spacecraft
capabilities. The relay in the prototype is simulated; it is not a claim
that a particular operational orbiter is available to relay the signal.

### 2. Trajectory deviation and emergency propulsion assessment

MoonNav explores descent scenarios in which a lander overshoots,
undershoots, or approaches the surface with excessive horizontal or
vertical velocity.

The simulator can compare:

-   The planned descent trajectory.
-   A deviated or unsafe trajectory.
-   A possible corrected trajectory.

It can assess illustrative recovery manoeuvres such as retrograde
braking, vertical braking, or lateral diversion. Configurable vehicle
assumptions---such as mass, thrust, specific impulse, remaining
propellant, and burn duration---can be used to estimate required
velocity change and propellant consumption.

A correction is not assumed to be possible in every situation. If the
remaining fuel, available thrust, altitude, time, or geometry is
insufficient, the system should report that recovery is infeasible under
the selected assumptions.

### 3. Visual navigation and terrain awareness

Camera-based navigation is explored as a way to improve situational
awareness when other navigation information is limited or uncertain.

The concept is to compare camera observations with available lunar
terrain imagery and elevation information to estimate position and
recognise nearby terrain features or hazards. This is a prototype
concept, not a claim of flight-qualified visual navigation or guaranteed
position recovery.

### 4. Alternative landing-site assessment

If the original target becomes unsafe or unreachable, MoonNav can help
compare candidate landing locations using available mission and terrain
information, including:

-   Terrain slope, elevation, roughness, and hazard information where
    available.
-   Sunlight and illumination opportunities.
-   Geometric Earth visibility and communication windows.
-   Distance from the predicted touchdown or divert point.
-   Estimated propulsion and manoeuvre feasibility.
-   Data coverage, resolution, and uncertainty.

The purpose is to explain the trade-offs and constraints behind
candidate locations. A weighted score must not override a mandatory
safety constraint. A location with missing or insufficient data should
be identified as **unknown**, not automatically treated as safe.

------------------------------------------------------------------------

## How it works

A typical demonstration can follow this sequence:

1.  **Plan a mission:** Select a lunar South Pole site and time window,
    then review terrain, sunlight, and Earth-visibility conditions.
2.  **Start a descent simulation:** Display the lander, target area, and
    planned trajectory in the 3D lunar scene.
3.  **Introduce a communication blackout:** Block the direct Earth path
    and inspect the reason for the loss of geometric visibility.
4.  **Check relay visibility:** Move the simulated relay through its
    orbit and identify whether both lander-to-relay and relay-to-Earth
    visibility are simultaneously available.
5.  **Introduce a trajectory deviation:** Simulate an overshoot,
    undershoot, or excessive descent velocity.
6.  **Evaluate recovery:** Estimate whether a corrective manoeuvre is
    feasible under the selected propulsion assumptions.
7.  **Assess alternative landing sites:** Compare reachable candidates
    and inspect terrain, illumination, visibility, and uncertainty.
8.  **Review the outcome:** Understand which options passed, failed, or
    remain uncertain---and why.

This workflow is a decision-support demonstration. It does not
autonomously choose or execute a real spacecraft manoeuvre.

## Benefits

-   **Communication resilience:** Explores alternative geometric
    communication paths when direct Earth visibility is unavailable.
-   **Contingency awareness:** Makes unexpected mission conditions
    easier to examine and discuss.
-   **Recovery feasibility:** Shows that propulsion corrections depend
    on physical limits, not simply on activating a booster.
-   **Terrain-aware decisions:** Brings terrain, lighting, visibility,
    and landing-site information together.
-   **Alternative-site comparison:** Helps identify candidate locations
    and explain why they may or may not be reachable or suitable.
-   **Explainability:** Makes assumptions, data gaps, constraints, and
    reasons behind results visible to users.
-   **Accessible visualisation:** Uses an interactive 3D environment to
    make complex mission geometry easier to understand.

## Intended impact

MoonNav aims to encourage a shift from considering only the nominal
landing plan toward **contingency-aware lunar mission planning**.

It helps mission planners and learners ask practical questions:

-   What happens if direct communication with Earth is lost?
-   Is a relay geometry available at that moment?
-   Has the lander deviated too far from its intended trajectory?
-   Is there enough propulsion authority and propellant for a
    correction?
-   Has the original landing zone become unsafe or unreachable?
-   Is another landing location reachable, and what risks or unknowns
    does it have?

By combining verifiable scientific information with transparent
simulation, MoonNav aims to support better understanding of mission
uncertainty and possible responses, contributing to safer and more
resilient future lunar exploration.

------------------------------------------------------------------------

## Scientific data and reference resources

MoonNav uses or references the following resources for different
purposes. Their roles are deliberately distinguished: a reference
website is not automatically a live data API, and an educational source
is not a source of real-time spacecraft telemetry.

  -------------------------------------------------------------------------------------------------------------------------
  Resource                What it contributes     Link
  ----------------------- ----------------------- -------------------------------------------------------------------------
  **QuickMap --- ASU /    Lunar imagery, surface  [quickmap.lroc.asu.edu](https://quickmap.lroc.asu.edu/)
  LROC**                  context, and            
                          exploration of lunar    
                          features using LRO/LROC 
                          products. QuickMap is   
                          an ASU/LROC interface,  
                          not itself a            
                          NASA-operated API.      

  **NASA Moon Trek**      Lunar mapping and       [trek.nasa.gov/moon](https://trek.nasa.gov/moon/)
                          access to               
                          terrain-related         
                          products such as        
                          elevation and slope,    
                          subject to product      
                          availability and        
                          documented access       
                          methods.                

  **NASA/JPL Horizons**   Celestial ephemeris     [Horizons](https://ssd.jpl.nasa.gov/horizons/) · [API
                          information for         documentation](https://ssd-api.jpl.nasa.gov/doc/horizons.html)
                          supported Sun, Earth,   
                          and lunar-observer      
                          geometry calculations.  

  **Canadian Space Agency Background on Canadian  [CSA Moon
  --- Moon Exploration**  lunar exploration       Exploration](https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/)
                          contributions and       
                          future lunar            
                          infrastructure,         
                          including Gateway and   
                          Canadarm3. This is a    
                          reference resource, not 
                          a live relay telemetry  
                          API.                    
  -------------------------------------------------------------------------------------------------------------------------

### Scientific data integrity

-   Use official, documented data products and APIs where available.
-   Record the actual product, identifier, resolution, source, retrieval
    method, and relevant metadata when a dataset is integrated.
-   Distinguish retrieved measurements, derived calculations, cached
    products, and illustrative simulation parameters.
-   Do not label a source as integrated merely because its website is
    linked.
-   Do not invent live orbital positions, relay availability, or
    spacecraft telemetry.
-   Treat unavailable or incomplete terrain information as uncertainty,
    not as evidence of safety.

### Important scientific distinctions

-   **Geometric visibility is not the same as a working radio link.**
-   **A simulated relay is not an operational relay spacecraft.**
-   **A simulated thruster burn is not a flight-approved manoeuvre.**
-   **Camera-based terrain matching is not automatically a validated
    navigation solution.**
-   **A candidate landing site is not a certified or NASA-approved
    landing site.**

------------------------------------------------------------------------

## Technology stack

MoonNav is built as a web-based scientific visualisation and
decision-support application.

  -----------------------------------------------------------------------
  Layer                               Technology
  ----------------------------------- -----------------------------------
  Web application and                 Next.js 16 (App Router), React 19,
  backend-for-frontend                TypeScript

  Styling                             Tailwind CSS 4

  Authentication                      Better Auth, including
                                      email/password, verification,
                                      password reset, and TOTP MFA

  Database                            PostgreSQL, Supabase in production,
                                      Drizzle ORM and versioned SQL
                                      migrations

  Object storage                      Supabase Storage in production;
                                      local signed storage driver in
                                      development

  Scientific service                  Python 3.12, FastAPI, SpiceyPy
                                      (NAIF SPICE), NumPy

  Visualisation                       OpenLayers, Apache ECharts, React
                                      Three Fiber

  Testing                             pytest, Vitest, Playwright
                                      (Chromium, Firefox, WebKit), axe

  Deployment                          Vercel
  -----------------------------------------------------------------------

### Scientific approach

The existing MoonNav scientific foundation includes NASA LOLA terrain
data, lunar curvature in terrain-aware calculations, and NAIF SPICE
ephemerides cross-checked against JPL Horizons. The platform's
established purpose is to compare lunar South Pole sites and dates using
terrain-aware direct sunlight and geometric direct-to-Earth visibility.

Emergency scenarios add a simulation layer on top of that scientific
foundation. Simulation assumptions must remain visible and separate from
measured or retrieved data.

------------------------------------------------------------------------

## Running MoonNav locally

The existing repository provides a macOS setup workflow:

``` bash
npm run setup
npm run dev:all
npm run health
```

Then open:

``` text
http://localhost:3100
```

The development mail preview is available at:

``` text
http://localhost:3100/dev/mail
```

For detailed prerequisites, environment configuration, database setup,
and troubleshooting, see
[`docs/LOCAL_DEVELOPMENT.md`](docs/LOCAL_DEVELOPMENT.md).

### Useful scripts

  -----------------------------------------------------------------------
  Command                             Purpose
  ----------------------------------- -----------------------------------
  `npm run dev:all`                   Start the local application stack

  `npm run health`                    Check web, database, science
                                      service, kernels, terrain, and
                                      worker readiness

  `npm run lint`                      Run ESLint

  `npm run typecheck`                 Run TypeScript checks

  `npm run test`                      Run Vitest

  `npm run science:test`              Run scientific Python tests

  `npx playwright test`               Run browser end-to-end tests

  `npm run db:migrate`                Apply database migrations

  `npm run data:fetch`                Fetch configured source products

  `npm run data:assets`               Build derived map layers and
                                      visualisation assets
  -----------------------------------------------------------------------

------------------------------------------------------------------------

## Documentation

The repository includes additional technical and scientific
documentation:

-   [`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md) ---
    implementation status.
-   [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md) --- data sources.
-   [`docs/SCIENTIFIC_METHODS.md`](docs/SCIENTIFIC_METHODS.md) ---
    equations, reference frames, assumptions, and validation.
-   [`docs/DATA_CATALOG.md`](docs/DATA_CATALOG.md) --- data products,
    versions, licences, and checksums.
-   [`docs/KNOWN_LIMITATIONS.md`](docs/KNOWN_LIMITATIONS.md) --- known
    limitations and claims the system cannot make.
-   [`docs/API_REFERENCE.md`](docs/API_REFERENCE.md) --- API reference.
-   [`docs/TESTING.md`](docs/TESTING.md) --- testing instructions.
-   [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) --- deployment
    architecture and procedures.
-   [`CLAUDE_HANDOFF.md`](CLAUDE_HANDOFF.md) --- project handoff and
    remaining actions.

Before presenting a particular emergency capability as implemented and
verified, check the current implementation status and test evidence in
the repository.

------------------------------------------------------------------------

## Historical motivation

Past lunar and maritime missions remind us that planning assumptions and
real-world outcomes can differ. However, their failure circumstances are
not identical and should not be reduced to one shared cause.

MoonNav uses historical examples only as motivation for studying
uncertainty, communication resilience, trajectory monitoring, and
contingency planning. It does not claim that this prototype would
necessarily have prevented any historical accident.

------------------------------------------------------------------------

## Project vision

**A mission should not be understood only by its planned path, but also
by the options available when that path changes.**

MoonNav aims to make those options visible, testable, and
understandable---combining lunar science, terrain awareness,
communication geometry, and emergency-response simulation in one
decision-support environment.

------------------------------------------------------------------------

*MoonNav is an independent NASA Space Apps Challenge project. NASA, JPL,
ASU/LROC, and the Canadian Space Agency are acknowledged as data or
reference providers where applicable; this acknowledgement does not
imply their endorsement of MoonNav.*
