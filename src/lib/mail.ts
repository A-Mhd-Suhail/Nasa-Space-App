import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";
import { env, isLocalOrigin } from "./env";

export type Mail = { to: string; subject: string; text: string; kind: string };

/**
 * Drivers:
 * - smtp:   any SMTP server (Gmail/Workspace app password, Outlook, SES, Mailgun, ...) via SMTP_* variables.
 * - resend: Resend HTTP API (RESEND_API_KEY).
 * - outbox: local development only — writes messages to data/outbox/ (viewable at /dev/mail) instead of
 *           delivering them; never logged to the console because they contain one-time links.
 * Sending failures throw so the caller can report them instead of pretending mail was sent.
 */
export function mailIsLocalOnly(): boolean {
  return env().MAIL_DRIVER === "outbox";
}

/** a***@gmail.com — enough to see the right recipient in logs without storing the address. */
function maskEmail(addr: string): string {
  const [l, d] = addr.split("@");
  return `${(l ?? "").slice(0, 1)}***@${d ?? "?"}`;
}
/** Host of the first link in the body ("localhost" in production would be a misconfiguration). Never the path/token. */
function linkHost(text: string): string | null {
  const u = text.match(/https?:\/\/[^\s]+/)?.[0];
  try {
    return u ? new URL(u).host : null;
  } catch {
    return null;
  }
}
const TRANSIENT = new Set(["ETIMEDOUT", "ECONNECTION", "ECONNRESET", "ESOCKET", "EDNS", "EAI_AGAIN"]);

/** One JSON log line per delivery attempt: no credentials, message text, links, tokens or full addresses. */
function logDelivery(fields: Record<string, unknown>) {
  const line = JSON.stringify({ event: "mail.delivery", ...fields });
  if (fields.status === "failed") console.error(line);
  else console.info(line);
}

/**
 * Sends a message and returns only after the provider has accepted or refused it.
 * SMTP: "accepted" means the server queued the message for the recipient (it is not an inbox guarantee);
 * a rejected recipient or an SMTP error throws. The caller (Better Auth) catches and logs thrown errors
 * so account endpoints stay non-enumerating; the structured log above is the record of what happened.
 */
export async function sendMail(m: Mail): Promise<void> {
  const e = env();
  const base = { kind: m.kind, driver: e.MAIL_DRIVER, to: maskEmail(m.to), linkHost: linkHost(m.text), appUrlHost: new URL(e.APP_URL).host };
  const t0 = Date.now();
  if (e.MAIL_DRIVER !== "outbox" && base.linkHost && isLocalOrigin(`http://${base.linkHost}`) && !isLocalOrigin(e.APP_URL)) {
    logDelivery({ ...base, status: "failed", error: "link points to localhost while APP_URL is public" });
    throw new Error("mail link host is localhost in a non-local deployment");
  }
  if (e.MAIL_DRIVER === "resend") {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${e.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: e.MAIL_FROM, to: m.to, subject: m.subject, text: m.text }),
    });
    const body = (await r.json().catch(() => null)) as { id?: string } | null;
    logDelivery({ ...base, status: r.ok ? "accepted" : "failed", httpStatus: r.status, messageId: body?.id ?? null, ms: Date.now() - t0 });
    if (!r.ok) throw new Error(`mail provider error ${r.status}`);
    return;
  }
  if (e.MAIL_DRIVER === "smtp") {
    if (!e.SMTP_HOST) throw new Error("SMTP_HOST is not configured");
    const secure = e.SMTP_SECURE === "true" || e.SMTP_PORT === 465;
    const cfg = { host: e.SMTP_HOST, port: e.SMTP_PORT ?? 587, secure, fromDomain: e.MAIL_FROM.split("@").pop()?.replace(/[>"]/g, "") };
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        // A fresh transport per attempt: a cached one can hold a socket that a frozen serverless instance already lost.
        const t = nodemailer.createTransport({
          host: cfg.host,
          port: cfg.port,
          secure,
          auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASSWORD ?? "" } : undefined,
          connectionTimeout: 15_000,
          greetingTimeout: 15_000,
          socketTimeout: 30_000,
        });
        const info = await t.sendMail({ from: e.MAIL_FROM, to: m.to, subject: m.subject, text: m.text });
        t.close();
        const rejected = info.rejected.length;
        logDelivery({
          ...base, status: rejected ? "rejected" : "accepted", attempt, host: cfg.host, port: cfg.port, secure, fromDomain: cfg.fromDomain,
          messageId: info.messageId, accepted: info.accepted.length, rejected, smtpResponse: String(info.response ?? "").slice(0, 80), ms: Date.now() - t0,
        });
        if (rejected) throw new Error("mail recipient rejected by the SMTP server");
        return;
      } catch (err) {
        const x = err as { code?: string; responseCode?: number; command?: string; message?: string };
        if (x.message === "mail recipient rejected by the SMTP server") throw err;
        const retry = attempt === 1 && (TRANSIENT.has(x.code ?? "") || (x.responseCode !== undefined && x.responseCode >= 400 && x.responseCode < 500));
        logDelivery({
          ...base, status: "failed", attempt, willRetry: retry, host: cfg.host, port: cfg.port, secure, errorCode: x.code ?? null, smtpResponseCode: x.responseCode ?? null,
          smtpCommand: x.command ?? null, error: String(x.message ?? "unknown").replace(/\s+/g, " ").slice(0, 160), ms: Date.now() - t0,
        });
        if (!retry) throw err;
      }
    }
    return;
  }
  if (e.NODE_ENV === "production" && !isLocalOrigin(e.APP_URL)) throw new Error("MAIL_DRIVER=outbox is only allowed for a local APP_URL");
  const dir = path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "outbox");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${Date.now()}-${m.kind}-${m.to.replace(/[^a-z0-9@._-]/gi, "_")}.json`);
  await writeFile(file, JSON.stringify({ ...m, sentAt: new Date().toISOString() }, null, 2));
}
