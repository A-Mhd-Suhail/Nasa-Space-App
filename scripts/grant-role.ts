/* Bootstrap or change a role from a trusted shell. This is the ONLY way to create the first administrator: there is no
   public or in-app endpoint for it, and no credentials are hardcoded anywhere.

   Usage: npx tsx --env-file=.env.local scripts/grant-role.ts <email> <user|analyst|curator|admin> "<reason>"

   Safety checks (all enforced before anything is written):
     - the account must already exist, have a VERIFIED email and be active (a demo account is never promoted);
     - you must type the target address again to confirm (or pass it as CONFIRM_EMAIL for non-interactive use);
     - existing sessions of that user are revoked, and the change is written to the audit log with your reason.
   Curator and admin roles also require the user to enrol two-factor authentication before any admin page opens
   (enforced by the application on every request, not by this script). */
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { Pool } from "pg";

const ROLES = ["user", "analyst", "curator", "admin"];

async function confirm(email: string): Promise<boolean> {
  if (process.env.CONFIRM_EMAIL) return process.env.CONFIRM_EMAIL.trim().toLowerCase() === email;
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const typed = (await rl.question(`Type the email address again to confirm: `)).trim().toLowerCase();
  rl.close();
  return typed === email;
}

async function main() {
  const [rawEmail, role, reason] = process.argv.slice(2);
  if (!rawEmail || !ROLES.includes(role) || !reason || reason.trim().length < 8) throw new Error('usage: grant-role <email> <user|analyst|curator|admin> "<reason, at least 8 characters>"');
  const email = rawEmail.trim().toLowerCase();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL });
  try {
    const u = await pool.query(`select id, role, email_verified, status, two_factor_enabled from "user" where email = $1`, [email]);
    if (!u.rowCount) throw new Error("no such user (the person must register first)");
    const row = u.rows[0];
    if (email.endsWith("@demo.moonnav.invalid")) throw new Error("demo accounts can never be promoted");
    if (!row.email_verified) throw new Error("refusing: the user has not verified their email address");
    if (row.status !== "active") throw new Error(`refusing: account status is "${row.status}"`);
    if (row.role === role) throw new Error(`nothing to do: ${email} already has role ${role}`);
    console.log(`About to change ${email}: ${row.role} -> ${role} (two-factor ${row.two_factor_enabled ? "already enabled" : "NOT yet enabled"}).`);
    if (!(await confirm(email))) throw new Error("not confirmed; nothing was changed");
    await pool.query(`update "user" set role = $1, updated_at = now() where id = $2`, [role, row.id]);
    await pool.query(`delete from session where user_id = $1`, [row.id]);
    await pool.query(`insert into audit_events (id, actor_user_id, action, object_type, object_id, metadata) values ($1, null, 'user.role_change', 'user', $2, $3)`, [
      `aud_${randomUUID()}`, row.id, JSON.stringify({ from: row.role, to: role, reason, via: "scripts/grant-role.ts" }),
    ]);
    console.log(`role of ${email} set to ${role}; their sessions were revoked.`);
    if (role === "admin" || role === "curator") console.log("Next: they sign in, enable two-factor at Settings > Security and save the backup codes; admin pages stay locked until then.");
  } finally {
    await pool.end();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
