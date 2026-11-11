import { screeningRoute } from "@/lib/screening-proxy";
/** Location and date sensitivity of sunlight, direct-to-Earth time and suitability. */
export const POST = screeningRoute("/v1/sensitivity", "sensitivity", 12);
export const maxDuration = 300;
