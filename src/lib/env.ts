import "server-only";
import { z } from "zod";

/**
 * Typed, validated server configuration. Secrets never reach the client bundle:
 * this module is server-only and nothing here is prefixed NEXT_PUBLIC_.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  SCIENCE_API_URL: z.url().default("http://127.0.0.1:8001"),
  SCIENCE_SERVICE_TOKEN: z.string().min(24, "SCIENCE_SERVICE_TOKEN must be at least 24 characters"),
  STORAGE_DRIVER: z.enum(["local", "r2"]).default("local"),
  LOCAL_STORAGE_DIR: z.string().default("data/objects"),
  STORAGE_SIGNING_SECRET: z.string().min(32).optional(),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_ENDPOINT: z.url().optional(),
  MAIL_DRIVER: z.enum(["outbox", "resend", "smtp"]).default("outbox"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_SECURE: z.enum(["true", "false"]).optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().default("MoonNav <no-reply@moonnav.invalid>"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/** True when the app is served from this machine (a local production build counts). */
export function isLocalOrigin(appUrl: string): boolean {
  const h = new URL(appUrl).hostname;
  return h === "localhost" || h === "127.0.0.1" || h === "::1" || h.endsWith(".localhost");
}

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid server configuration: ${issues}`);
  }
  const e = parsed.data;
  if (e.NODE_ENV === "production" && !isLocalOrigin(e.APP_URL)) {
    if (e.MAIL_DRIVER === "outbox") throw new Error("Invalid server configuration: MAIL_DRIVER=outbox is only allowed for a local APP_URL");
    if (e.STORAGE_DRIVER === "local") throw new Error("Invalid server configuration: STORAGE_DRIVER=local is only allowed for a local APP_URL");
  }
  if (e.NODE_ENV === "production") {
    if (e.STORAGE_DRIVER === "r2" && !(e.R2_ACCESS_KEY_ID && e.R2_SECRET_ACCESS_KEY && e.R2_BUCKET && (e.R2_ENDPOINT || e.R2_ACCOUNT_ID))) {
      throw new Error("Invalid server configuration: R2 storage selected but R2_* variables are incomplete");
    }
    if (e.MAIL_DRIVER === "smtp" && !e.SMTP_HOST) {
      throw new Error("Invalid server configuration: MAIL_DRIVER=smtp requires SMTP_HOST (and usually SMTP_USER / SMTP_PASSWORD)");
    }
    if (e.MAIL_DRIVER === "resend" && !e.RESEND_API_KEY) {
      throw new Error("Invalid server configuration: MAIL_DRIVER=resend requires RESEND_API_KEY");
    }
  }
  cached = e;
  return e;
}
