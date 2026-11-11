/* Send one real test email through the configured MAIL_DRIVER (smtp | resend) to verify delivery.
   Usage: npm run mail:test -- you@example.com     (reads .env.local; never prints credentials) */
import nodemailer from "nodemailer";

async function main() {
  const to = process.argv[2];
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error("usage: npm run mail:test -- you@example.com");
  const e = process.env;
  const from = e.MAIL_FROM ?? "MoonNav <no-reply@example.org>";
  const subject = "MoonNav SMTP test";
  const text = `This is a test message from your MoonNav installation (${e.APP_URL ?? "local"}). If you received it, verification emails will be delivered.`;
  if (e.MAIL_DRIVER === "smtp") {
    for (const k of ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"]) if (!e[k]) throw new Error(`${k} is not set in .env.local`);
    const port = Number(e.SMTP_PORT ?? 587);
    const t = nodemailer.createTransport({ host: e.SMTP_HOST, port, secure: e.SMTP_SECURE === "true" || port === 465, auth: { user: e.SMTP_USER!, pass: e.SMTP_PASSWORD! }, connectionTimeout: 15_000 });
    await t.verify();
    const info = await t.sendMail({ from, to, subject, text });
    console.log(`sent via SMTP ${e.SMTP_HOST}:${port} — message id ${info.messageId}; accepted ${info.accepted.length}, rejected ${info.rejected.length}`);
  } else if (e.MAIL_DRIVER === "resend") {
    const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${e.RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to, subject, text }) });
    if (!r.ok) throw new Error(`Resend HTTP ${r.status}`);
    console.log("sent via Resend");
  } else {
    throw new Error(`MAIL_DRIVER=${e.MAIL_DRIVER ?? "outbox"} does not deliver real email; set MAIL_DRIVER=smtp and SMTP_* in .env.local`);
  }
}
main().catch((err) => {
  // Error messages from nodemailer never include the password; keep output to the message only.
  console.error(`mail test failed: ${(err as Error).message}`);
  process.exit(1);
});
