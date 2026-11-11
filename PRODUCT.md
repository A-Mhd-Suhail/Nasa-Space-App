# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
- **Primary: lunar mission planners and analysts** comparing south-polar candidate locations and dates. They configure immutable scenarios (site, UTC window, terrain product, visibility rule, antenna mask, optional panel assumptions), run analyses, compare 2–4 results under hard gates, and export reproducible reports. When trade-offs arise, their precision, data density and trust win (confirmed 2026-11-10).
- Secondary: challenge judges and the public (public explorer, precomputed demonstrations), educators and students (Learn mode), data curators and administrators (registry, jobs, users, audit).

## Product Purpose
MoonNav shows where the Sun and Earth sit above the *real local horizon* at lunar south-polar sites, turning that into refined sunlight intervals, geometric direct-to-Earth (DTE) windows and optional idealized panel energy, so sites and dates can be compared quickly and transparently. Success: a planner can go from a site and date to a defensible, reproducible comparison with every assumption visible.

## Positioning
A standalone product; the 2026 NASA Space Apps Challenge "Lunar Landing Site Navigator" is credited as context, not the headline (confirmed). Its distinct mechanism: terrain-aware visibility from LOLA LDEM_75S_240M with lunar curvature and NAIF SPICE ephemerides validated against JPL Horizons (< 0.01°), with provenance on every number.

## Operating Context
Desktop-first analysis sessions (1280–1440 px), also tablet and phone review. Work is project → scenario → analysis job (queued/running/completed) → Sun & Power / Earth & DTE / Site 3D → compare → report (PDF/CSV/JSON) → share link. All scientific times are UTC.

## Capabilities and Constraints
- Terrain coverage 75°S–90°S only (240 m). Sites are IAU/USGS Gazetteer feature centres, never "approved landing sites".
- DTE is geometric line of sight, never RF link availability. Energy only with explicit panel assumptions.
- Data labels: Source data, Calculated, Modelled, Illustrative, Cached/Precomputed, Unavailable.
- Not integrated: Moon Trek/LROC imagery, global imagery globe, live Horizons provider.

## Brand Commitments
Name "MoonNav". Independent research/education prototype, not NASA-owned, endorsed or flight-certified. User brief (binding, 2026-11-10): light-first warm lunar palette (lunar ivory, mineral stone, parchment, basalt, warm graphite, champagne gold, muted copper, mineral sage, optional restrained lunar violet), no generic blue/black, editorial display face + readable sans, designed light and dark themes, subtle reduced-motion-safe animation.

## Evidence on Hand
Real LOLA-derived map layers (`public/data/*.png`), 4 precomputed demos (`public/data/demo/`), 3D terrain patches (`public/data/terrain/`), site catalogue (`src/data/sites.json`), Horizons validation fixtures. No testimonials, users, customers, press or performance benchmarks exist; never fabricate them.

## Product Principles
1. Scientific truth over visual effect: every number carries its kind and provenance.
2. Unknown is a valid answer; never fill gaps with zero.
3. Planners first: dense, legible, keyboard-friendly instruments.
4. Explain without changing the numbers (Learn mode shows the same results).
5. Reproducible by default: immutable inputs, versioned products and methods.

## Accessibility & Inclusion
WCAG 2.2 AA target; reduced motion respected; state never conveyed by colour alone.
