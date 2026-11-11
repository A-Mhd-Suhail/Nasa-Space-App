/* Bootstrap or change a role from a trusted shell (the first admin cannot be created in the UI).
   Usage: npx tsx --env-file=.env.local scripts/grant-role.ts <email> <user|analyst|curator|admin> "<reason>" */
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

async function main() {
  const [email, role, reason] = process.argv.slice(2);
  if (!email || !["user", "analyst", "curator", "admin"].includes(role) || !reason) throw new Error("usage: grant-role <email> <role> <reason>");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL });
  const r = await pool.query("update \"user\" set role = $1, updated_at = now() where email = $2 returning id, role", [role, email]);
  if (!r.rowCount) throw new Error("no such user");
  await pool.query("delete from session where user_id = $1", [r.rows[0].id]);
  await pool.query("insert into audit_events (id, actor_user_id, action, object_type, object_id, metadata) values ($1, null, 'user.role_change', 'user', $2, $3)", [`aud_${randomUUID()}`, r.rows[0].id, JSON.stringify({ to: role, reason, via: "scripts/grant-role.ts" })]);
  console.log(`role of ${email} set to ${role}`);
  await pool.end();
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
