---
name: MoonNav — Traverse Field Book
description: A lunar field book for planners. Parchment pages and basalt ink by day, basalt night with chalk ink after dark; copper marks the traverse.
colors:
  paper: "#f4f0e7"
  band: "#ece6d9"
  sheet: "#fffcf5"
  sheet-inset: "#f8f3e8"
  rule: "#ddd6c9"
  rule-strong: "#cbc2b1"
  ink: "#292722"
  ink-2: "#4a463e"
  muted: "#68635a"
  copper: "#9a543c"
  champagne: "#c5a46d"
  sun-ink: "#82601f"
  lunar-violet: "#5f5589"
  sage-ok: "#46704d"
  oxide-bad: "#a8402f"
  warn: "#8a5c15"
  unknown: "#6a655b"
  night-paper: "#1c1a17"
  night-sheet: "#25221e"
  night-rule: "#3a362f"
  chalk-ink: "#efe9dd"
  night-copper: "#d99577"
  night-sun: "#e2be7a"
  night-violet: "#afa4d6"
  viewport: "#141210"
typography:
  display:
    fontFamily: "Newsreader, Georgia, serif"
    fontSize: "clamp(2.6rem, 1.6rem + 3.6vw, 4.4rem)"
    fontWeight: 500
    lineHeight: 1.02
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Newsreader, Georgia, serif"
    fontSize: "clamp(1.75rem, 1.2rem + 1.6vw, 2.5rem)"
    fontWeight: 500
    lineHeight: 1.1
  body:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
  reading:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 600
  caption:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
  menu-display:
    fontFamily: "Newsreader, Georgia, serif"
    fontSize: "22px"
    fontWeight: 400
  tag:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "10px"
    fontWeight: 500
    letterSpacing: "0.06em"
  data:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "11px"
    fontWeight: 500
    letterSpacing: "0.06em"
rounded:
  tag: "3px"
  control: "5px"
  sheet: "6px"
  dialog: "8px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  section: "64px"
components:
  button-primary:
    backgroundColor: "{colors.copper}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.control}"
    height: "36px"
    padding: "0 16px"
  button-secondary:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "36px"
  sheet:
    backgroundColor: "{colors.sheet}"
    rounded: "{rounded.sheet}"
  data-tag:
    textColor: "{colors.copper}"
    typography: "{typography.data}"
    rounded: "{rounded.tag}"
  input:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "36px"
---

## Overview
MoonNav is set as an Apollo-era geology **traverse field book** reinterpreted for a modern instrument: faint survey-grid paper, basalt ink, numbered stations, and copper "sample tags" that label every number by kind (source data, calculated, modelled, precomputed, unavailable). Light (parchment) is the primary theme; dark (basalt night) is designed separately, not inverted. Instrument viewports — the 2D chart frame and 3D terrain — stay night-lit in both themes because they show the Moon's own darkness.

## Colors
Copper is the single action and selection colour and draws the traverse line. Champagne ochre belongs to the Sun, lunar violet to Earth; these are semantic, never decorative. Sage green means a verified pass, oxide red blocked/failed, warm grey unknown. Every text token holds ≥ 4.5:1 on paper, sheet and band (table in docs/DESIGN_SYSTEM.md). No blue/black, no gradients on text, no neon.

## Typography
Newsreader (roman, optical sizes) carries headings and station names; IBM Plex Sans carries interface and reading text; IBM Plex Mono appears only for measurements, codes and data tags. Body measure 65–75ch; tabular numerals in every table and reading.

## Layout
12-column thinking with generous section rhythm (64 px) and tight groups inside sheets. Public pages: 1240 px container. Workspace: grouped, collapsible left rail (Plan / Analyse / Reference / Administration), top bar with workspace switcher, ⌘K search, live service status, theme switch and account menu. Ruled spreads and ledgers replace card grids where content is a list.

## Elevation & Depth
Sheets sit on paper with a 1 px rule and a soft two-layer shadow (`--shadow-sheet`); dialogs and menus float with `--shadow-float`. No zero-offset glows, no hard offset shadows.

## Shapes
Small, honest radii: 3 px tags, 5 px controls, 6 px sheets, 8 px dialogs. Station markers are ringed copper dots; the traverse is a 6/5 dashed copper line.

## Components
Primary / secondary / ghost / danger buttons; sheet + sheet header; breadcrumbs (no eyebrow kickers); sample-tag `DataTag`; `StatePill` with drawn icons for visible / partial / terrain-blocked / below horizon / below antenna mask / unknown; `Stat` readings; `Notice` with icon; ledger tables; segmented theme control; command palette; workspace switcher; time control; charts that read live theme tokens.

## Do's and Don'ts
Do label every number's kind and show unknown as unknown. Do keep geometric DTE separate from RF language. Do use drawn icons (Lucide, 1.75 stroke). Don't use eyebrow kickers, icon-tile card grids, gradient text, glassmorphism, or Unicode glyphs as icons. Don't animate more than one authored moment per view; respect reduced motion.
