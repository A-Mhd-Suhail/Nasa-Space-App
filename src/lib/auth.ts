import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { APIError, createAuthMiddleware, getSessionFromCtx, isAPIError } from "better-auth/api";
import { twoFactor } from "better-auth/plugins";
import { db, schema } from "@/db";
import { env } from "./env";
import { sendMail } from "./mail";

let _auth: ReturnType<typeof build> | null = null;

// Demo accounts (see lib/demo.ts) use an RFC 2606 ".invalid" address: never emailed, never changed.
const DEMO_SUFFIX = "@demo.moonnav.invalid";

/**
 * Email identity policy: trim and case-fold only. Gmail dots and "+tag" aliases are deliberately NOT folded
 * (user+a@gmail.com and user@gmail.com are different addresses and may belong to different people).
 * The database enforces the same rule (migration 0009: CHECK email = lower(btrim(email)) + unique index on lower(email)).
 */
export const normalizeEmail = (e: string) => e.trim().toLowerCase();
const EMAIL_PATHS = new Set(["/sign-up/email", "/sign-in/email", "/request-password-reset", "/send-verification-email"]);
const ACCOUNT_EXISTS = { code: "ACCOUNT_EXISTS", message: "You have already created an account with this email address. Please sign in." };
const DEMO_BLOCKED_PATHS = ["/change-password", "/change-email", "/update-user", "/delete-user", "/set-password", "/two-factor/enable", "/two-factor/disable", "/link-social", "/request-password-reset"];

function build() {
  const e = env();
  return betterAuth({
    appName: "MoonNav",
    baseURL: e.APP_URL,
    secret: e.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db(), {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        twoFactor: schema.twoFactor,
        rateLimit: schema.rateLimit,
      },
    }),
    user: {
      additionalFields: {
        role: { type: "string", required: false, defaultValue: "user", input: false },
        preferredMode: { type: "string", required: false, input: false },
        displayTimezone: { type: "string", required: false, defaultValue: "UTC", input: false },
        onboardedAt: { type: "date", required: false, input: false },
        termsAcceptedAt: { type: "date", required: false, input: false },
        status: { type: "string", required: false, defaultValue: "active", input: false },
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 60 * 30,
      sendResetPassword: async ({ user, url }) => {
        await sendMail({ to: user.email, kind: "reset-password", subject: "Reset your MoonNav password", text: `Use this link within 30 minutes to reset your password:\n\n${url}\n\nIf you did not request this, ignore this email.` });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60 * 24,
      sendVerificationEmail: async ({ user, url }) => {
        if (user.email.toLowerCase().endsWith(DEMO_SUFFIX)) return; // demo accounts are verified directly
        await sendMail({ to: user.email, kind: "verify-email", subject: "Verify your MoonNav email", text: `Confirm your email address to activate your account:\n\n${url}\n\nThe link expires in 24 hours.` });
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    rateLimit: {
      enabled: e.NODE_ENV !== "test" || process.env.MOONNAV_RATE_LIMIT_TEST === "1",
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 8 },
        "/sign-up/email": { window: 60, max: 5 },
        "/request-password-reset": { window: 300, max: 3 },
        "/send-verification-email": { window: 60, max: 3 },
        "/two-factor/verify-totp": { window: 60, max: 6 },
      },
    },
    advanced: {
      useSecureCookies: e.APP_URL.startsWith("https://"),
      cookiePrefix: "moonnav",
      ipAddress: { ipAddressHeaders: ["x-forwarded-for", "x-real-ip"] },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const raw = (ctx.body as { email?: unknown } | undefined)?.email;
        if (EMAIL_PATHS.has(ctx.path) && typeof raw === "string") {
          const email = normalizeEmail(raw);
          if (ctx.path === "/sign-up/email" && (await ctx.context.internalAdapter.findUserByEmail(email))?.user) {
            // Deliberate product behaviour: say so, but reveal nothing else (not verification state, role or name).
            throw new APIError("CONFLICT", ACCOUNT_EXISTS);
          }
          if (email !== raw) return { context: { ...ctx, body: { ...(ctx.body as object), email } } };
        }
        if (!DEMO_BLOCKED_PATHS.some((p) => ctx.path.startsWith(p))) return;
        const email = (ctx.body as { email?: string } | undefined)?.email;
        if (email?.toLowerCase().endsWith(DEMO_SUFFIX)) throw new APIError("FORBIDDEN", { message: "Demo accounts cannot change credentials." });
        const s = await getSessionFromCtx(ctx).catch(() => null);
        if (s?.user.email.toLowerCase().endsWith(DEMO_SUFFIX)) throw new APIError("FORBIDDEN", { message: "Demo accounts cannot change credentials or security settings. Create a free account to do this." });
      }),
      // Concurrent duplicate sign-ups: the loser hits the unique index inside the library's transaction (nothing is
      // left behind) and gets a generic failure; turn that into the same controlled answer as a sequential duplicate.
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-up/email") return;
        const r = ctx.context.returned;
        const email = (ctx.body as { email?: unknown } | undefined)?.email;
        if (isAPIError(r) && typeof email === "string" && (await ctx.context.internalAdapter.findUserByEmail(normalizeEmail(email)))?.user) {
          throw new APIError("CONFLICT", ACCOUNT_EXISTS);
        }
      }),
    },
    plugins: [twoFactor({ issuer: "MoonNav" }), nextCookies()],
  });
}

export function auth() {
  if (!_auth) _auth = build();
  return _auth;
}
