# Design system — "Traverse Field Book"

The authoritative, implementation-level design record. Brand brief: `DESIGN.md` (tokens, typography); product brief: `PRODUCT.md`; UI/UX decision record + pre-delivery checklist: `design-system/moonnav/MASTER.md`. The user brief is binding: light-first warm lunar palette, no generic blue/black, editorial display face + readable sans, designed light **and** dark themes, subtle reduced-motion-safe animation.

## Identity

- **Name:** MoonNav. Independent research/education prototype — never NASA-owned, endorsed or flight-certified; never "NASA-approved site selection".
- **Metaphor:** a field book for traverse planning — parchment pages by day, basalt night after dark; copper marks the traverse. Analytical pages stay dense and legible; the landing page may be more cinematic but never dishonest.

## Colour tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `paper` / `night-paper` | `#f4f0e7` | `#1c1a17` | app background |
| `sheet` / `night-sheet` | `#fffcf5` | `#25221e` | cards, panels |
| `band` | `#ece6d9` | — | page bands |
| `rule` / `rule-strong` | `#ddd6c9` / `#cbc2b1` | `#3a362f` | borders, dividers |
| `ink` / `chalk-ink` | `#292722` | `#efe9dd` | primary text |
| `ink-2` | `#4a463e` | — | secondary text |
| `muted` / `unknown` | `#68635a` / `#6a655b` | — | metadata, unknown states |
| `copper` / `night-copper` | `#9a543c` | `#d99577` | primary accent, selection, links |
| `champagne` | `#c5a46d` | — | secondary highlight |
| `sun-ink` / `night-sun` | `#82601f` | `#e2be7a` | Sun data, illumination |
| `lunar-violet` / `night-violet` | `#5f5589` | `#afa4d6` | Earth/communication accents |
| `sage-ok` | `#46704d` | — | verified pass/visible only |
| `oxide-bad` | `#a8402f` | — | blocked/failed only |
| `warn` | `#8a5c15` | — | partial/stale states |
| `viewport` | — | `#141210` | 3D canvas surround |

Status is **never colour alone**: every state pairs a text label + icon + colour (`StatePill` in `src/components/ui.tsx`).

## Typography

- Display/titles: **Newsreader** (serif), tight leading, optical sizing — page titles, hero copy.
- Body/labels: **IBM Plex Sans** — 15 px body, 13 px labels.
- Measurements use tabular numerals (`.num`) so angles, hours and coordinates align in tables.

## Components

Shared primitives live in `src/components/ui.tsx`: `Button`, `Card`, `CardHeader`, `Field`, `Input`, `Notice`, `Stat`, `StatusPill`, `DataTag`, `PageHeader`, `cx`. `DataTag` carries the data-kind contract (Source data / Calculated / Modelled / Illustrative / Precomputed / Unavailable).

Layout regions (wide desktop): sticky top bar (mark, project/scenario, data status, profile), left nav rail (Overview, Projects, Scenario Builder, Site Explorer, Site Detail/3D, Sun & Power, Earth & DTE, Compare, Reports, Learn, Methodology, Sources; Admin only for authorised roles), 12-column main canvas, right inspector (site, coordinates, dates, DEM product, quality), bottom time-control bar on temporal pages (UTC, play/pause, step, speed, scrubber). Tablet collapses the rail and docks the inspector into a drawer; mobile stacks and uses the drawer nav (`PublicMobileNav`, `AppNav` mobile).

## Interaction rules

1. Every metric shows unit + short definition (tooltip/inline).
2. Every chart has legend, axis labels, timezone and a missing-data indication; hover is never the only access to a value.
3. Loading / no-data / stale / partial / error / success states are designed explicitly (never a blank card or a fake "live" dot).
4. A selected site/scenario always shows identifier + coordinate readout.
5. All controls work on keyboard and touch; focus states visible; `prefers-reduced-motion` respected globally (`MotionRoot`).
6. Data never animates in a way that implies physical motion absent from the calculation.

## Accessibility

WCAG 2.2 AA target; automated axe checks (serious+critical = 0) run in `tests/e2e/public.spec.ts:69` across seven public pages; responsive overflow checks at five widths run in `visual.spec.ts`; reduced-motion and keyboard navigation verified manually in the completion pass.

## Where things live

| Thing | Path |
|---|---|
| Global CSS tokens (light+dark) | `src/app/globals.css` |
| Theme boot + toggle | `src/app/layout.tsx`, `src/components/shell/ThemeToggle.tsx` |
| Motion policy | `src/components/shell/MotionRoot.tsx` |
| Brand mark | `src/components/shell/Mark.tsx` |
| Decision record | `design-system/moonnav/MASTER.md` |
| Token source of truth | `DESIGN.md` |
