import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nodemailer, { type Transporter } from "nodemailer";
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
let transport: Transporter | null = null;

export function mailIsLocalOnly(): boolean {
  return env().MAIL_DRIVER === "outbox";
}
export async function sendMail(m: Mail): Promise<void> {
  const e = env();
  if (e.MAIL_DRIVER === "resend") {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${e.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: e.MAIL_FROM, to: m.to, subject: m.subject, text: m.text }),
    });
    if (!r.ok) throw new Error(`mail provider error ${r.status}`);
    return;
  }
  if (e.MAIL_DRIVER === "smtp") {
    if (!e.SMTP_HOST) throw new Error("SMTP_HOST is not configured");
    transport ??= nodemailer.createTransport({
      host: e.SMTP_HOST,
      port: e.SMTP_PORT ?? 587,
      secure: e.SMTP_SECURE === "true" || e.SMTP_PORT === 465,
      auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASSWORD ?? "" } : undefined,
      connectionTimeout: 15_000,
    });
    await transport.sendMail({ from: e.MAIL_FROM, to: m.to, subject: m.subject, text: m.text });
    return;
  }
  if (e.NODE_ENV === "production" && !isLocalOrigin(e.APP_URL)) throw new Error("MAIL_DRIVER=outbox is only allowed for a local APP_URL");
  const dir = path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "outbox");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${Date.now()}-${m.kind}-${m.to.replace(/[^a-z0-9@._-]/gi, "_")}.json`);
  await writeFile(file, JSON.stringify({ ...m, sentAt: new Date().toISOString() }, null, 2));
}
