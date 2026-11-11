import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// CSP: same-origin by default; WebGL/blob workers for Three.js. The only third-party host is
// NASA Moon Trek (trek.nasa.gov), for LROC WAC imagery tiles (2D basemap and 3D globe texture),
// loaded as CORS images; LOLA-derived layers are served from this origin.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://trek.nasa.gov",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // The workspace is per-user and dynamic; we opt out of Cache Components and keep
  // explicit server-side authorization in every request (see docs/DECISION_LOG.md D-007).
  cacheComponents: false,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
  // Checklist endpoint names (docs/API_REFERENCE.md) map onto the versioned /api/v1 routes.
  async rewrites() {
    return [
      { source: "/api/sites", destination: "/api/v1/sites" },
      { source: "/api/sites/:id", destination: "/api/v1/sites/:id" },
      { source: "/api/locations", destination: "/api/v1/locations" },
      { source: "/api/locations/:id", destination: "/api/v1/locations/:id" },
      { source: "/api/terrain/elevation", destination: "/api/v1/terrain/point" },
      { source: "/api/terrain/horizon", destination: "/api/v1/terrain/horizon" },
      { source: "/api/terrain/profile", destination: "/api/v1/terrain/profile" },
      { source: "/api/ephemeris/:body", destination: "/api/v1/ephemeris/:body" },
      { source: "/api/analyze", destination: "/api/v1/analyze" },
      { source: "/api/compare", destination: "/api/v1/comparisons" },
      { source: "/api/timeline", destination: "/api/v1/timeline" },
      { source: "/api/reports/generate", destination: "/api/v1/reports" },
      { source: "/api/scenarios", destination: "/api/v1/scenarios" },
      { source: "/api/scenarios/:id", destination: "/api/v1/scenarios/:id" },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
        ],
      },
      { source: "/data/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }] },
    ];
  },
};

export default nextConfig;
