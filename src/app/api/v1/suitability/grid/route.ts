import { screeningRoute } from "@/lib/screening-proxy";
/** Dynamic landing-site suitability grid around a coordinate for a chosen UTC window. */
export const POST = screeningRoute("/v1/suitability/grid", "suitability", 12);
export const maxDuration = 300;
