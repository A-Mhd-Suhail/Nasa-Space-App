/**
 * Plain-language explanations shown as info tips on metric cards and in Simple mode.
 * Analogies follow the challenge brief (solar panel on a house, video call behind a
 * building, standing inside a crater).
 */
export const EXPLAIN = {
  solarElevation:
    "How high the Sun is in the lunar sky, in degrees above the flat local horizon. 0° is on the horizon, 90° is straight overhead. Near the south pole the Sun always stays low, often only a few degrees up.",
  solarAzimuth:
    "The compass direction of the Sun, measured clockwise from local north (0° north, 90° east, 180° south, 270° west). At the pole the Sun circles the whole horizon once per lunar day (~29.5 Earth days).",
  earthElevation:
    "How high Earth is above the flat local horizon. Positive means above it, negative means below it. Because the Moon keeps one face toward Earth, Earth barely moves in the sky — only a few degrees of 'libration' wobble.",
  earthAzimuth: "The compass direction of Earth from the landing site, clockwise from local north.",
  horizon:
    "The local horizon is the skyline formed by real terrain. Imagine standing in a deep crater: you cannot see everything because the walls block your view. MoonNav measures this skyline in every direction from NASA LOLA laser-altimeter terrain, including the curvature of the Moon.",
  clearance:
    "Clearance = body elevation − terrain horizon in that direction. Positive means the Sun or Earth is above the skyline; negative means a ridge or crater wall is in the way.",
  sunlightDuration:
    "How many hours the Sun's disk is above the terrain skyline during the chosen interval. Like a solar panel on a house: more sunlight means more electricity for the lander.",
  dteWindow:
    "Hours when Earth is in direct line of sight above the terrain (and above the antenna mask if one is set). Like trying to make a video call from behind a large building: if something blocks the line to Earth, the direct signal cannot get through. This is geometry only — not a full radio link budget.",
  terrainElevation: "Height of the ground at the site relative to the 1737.4 km reference sphere used by NASA LOLA (metres).",
  slope: "How steep the ground is, from neighbouring LOLA terrain samples. Steep slopes are a landing hazard.",
  psr: "Permanently shadowed regions are crater floors the Sun never reaches. They are extremely cold and may trap water ice.",
  feasibility:
    "Simplified MoonNav mission suitability score (0–100) built from the weights you choose. Not an official NASA mission feasibility rating. Hard constraints are applied first; only passing scenarios are scored.",
  confidence:
    "Calculated = computed by MoonNav from NASA SPICE ephemerides and LOLA terrain. Precomputed = the same engine run ahead of time. Modelled = idealized model with stated assumptions. Unavailable = data missing or outside coverage.",
} as const;
export type ExplainKey = keyof typeof EXPLAIN;
