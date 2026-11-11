/* Development accounts (local only). Passwords come from .env.local (DEV_PLANNER_PASSWORD, DEV_ADMIN_PASSWORD)
   and are never printed. Uses the real sign-up API, then marks the addresses verified and sets roles.
   Usage: npx tsx --env-file=.env.local scripts/seed-dev.ts   (web app must be running) */
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

const BASE = process.env.APP_URL ?? "http://localhost:3100";
const ACCOUNTS = [
  { email: "planner@moonnav.test", name: "Demo Planner", role: "user", pw: process.env.DEV_PLANNER_PASSWORD },
  { email: "admin@moonnav.test", name: "Demo Administrator", role: "admin", pw: process.env.DEV_ADMIN_PASSWORD },
];

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("refusing to seed development accounts in production");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  for (const a of ACCOUNTS) {
    if (!a.pw) throw new Error(`missing password env for ${a.email}`);
    const exists = await pool.query(`select id from "user" where email = $1`, [a.email]);
    if (!exists.rowCount) {
      const r = await fetch(`${BASE}/api/auth/sign-up/email`, { method: "POST", headers: { "Content-Type": "application/json", Origin: BASE }, body: JSON.stringify({ name: a.name, email: a.email, password: a.pw }) });
      if (!r.ok) throw new Error(`sign-up failed for ${a.email}: ${r.status}`);
    }
    const u = await pool.query(`update "user" set email_verified = true, role = $2, onboarded_at = coalesce(onboarded_at, now()), terms_accepted_at = coalesce(terms_accepted_at, now()), preferred_mode = coalesce(preferred_mode, 'planning') where email = $1 returning id`, [a.email, a.role]);
    await pool.query(`insert into audit_events (id, actor_user_id, action, object_type, object_id, metadata) values ($1, null, 'dev.seed_account', 'user', $2, $3)`, [`aud_${randomUUID()}`, u.rows[0].id, JSON.stringify({ role: a.role })]);
    console.log(`ready: ${a.email} (${a.role})`);
  }
  await pool.end();
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
