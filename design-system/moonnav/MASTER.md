# MoonNav — design system master (UI/UX Pro Max record)

Generated with `.claude/skills/ui-ux-pro-max/scripts/search.py` (ui-ux-pro-max-cli 2.15.0) on 2026-11-10, then reconciled with the user's binding brief and Impeccable's direction (Traverse Field Book). Only verified, adopted guidance is persisted here, per the skill's rule "do not persist unverified output".

## Queries run
| Query | Domain | Result | Decision |
|---|---|---|---|
| `scientific geospatial analysis dashboard space exploration …` | design-system | HUD / Sci-Fi FUI, star-white + launch-blue on #0B0B10, Exo + Roboto Mono | **Rejected** — exactly the generic blue/black sci-fi look the brief forbids; accessibility risk "high" |
| `editorial print cartography research publication archival scientific atlas` | design-system | Swiss Modernism 2.0, 12-col grid, serif headings, subtle scroll reveal 300–400 ms | **Adopted (structure)**: rational 12-col layout, serif display headings, one subtle reveal; palette replaced by the brief's warm lunar palette |
| `warm earth tones parchment stone copper editorial`, `natural muted sage olive warm neutral` | color | magazine / agriculture / yoga palettes | **Not adopted** (no lunar fit); user palette is binding |
| `editorial serif display modern sans scientific elegant` | typography | Playfair Display + Inter (Classic Elegant) | **Adapted**: serif display + humanist sans kept; Playfair/Inter swapped for Newsreader + IBM Plex Sans because Impeccable flags Inter (and Playfair italic heroes) as overused |
| `time series visibility intervals timeline` | chart | Line chart, hover + zoom; "use solid, dashed and dotted line styles plus direct labels; never distinguish series by hue alone" | **Adopted**: ECharts line/area with dataZoom, line styles + legend + decal patterns on bars |
| `data table density readability` | ux | "Tables can overflow on mobile → horizontal scroll" | **Adopted**: all wide tables scroll inside positioned containers |
| `focus visible keyboard navigation` | ux | complete keyboard paths, visible focus, tab order = visual order | **Adopted**: copper focus rings, command palette and menus fully keyboard operable |

## Pre-delivery checklist (from the skill)
- [x] No emojis/Unicode glyphs as icons (Lucide SVG)
- [x] Pointer cursor on clickable controls
- [x] Hover transitions 150–300 ms
- [x] Light-mode text contrast ≥ 4.5:1 (computed table in docs/DESIGN_SYSTEM.md)
- [x] Visible focus states
- [x] prefers-reduced-motion respected (MotionConfig `reducedMotion="user"` + CSS)
- [x] Responsive at 360, 390, 768, 1280, 1440 (Playwright visual suite)

Tokens: see `DESIGN.md` (frontmatter) and `src/app/globals.css`.
