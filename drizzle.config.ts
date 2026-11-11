import { defineConfig } from "drizzle-kit";

// Migrations use the direct (non-pooled) connection when the provider offers one.
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL ?? "" },
  strict: true,
  verbose: true,
});
