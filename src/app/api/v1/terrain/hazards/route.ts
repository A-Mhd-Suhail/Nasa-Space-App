import { screeningRoute } from "@/lib/screening-proxy";
/** Terrain hazard screening (slope, roughness, relief, rims) around a coordinate — not a safety certification. */
export const POST = screeningRoute("/v1/terrain/hazards", "hazards", 30);
export const maxDuration = 300;
