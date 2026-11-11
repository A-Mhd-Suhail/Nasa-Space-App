import { screeningRoute } from "@/lib/screening-proxy";
/** Site x date suitability matrix (up to 8 sites x 8 windows). */
export const POST = screeningRoute("/v1/suitability/matrix", "suitability-matrix", 12);
export const maxDuration = 300;
