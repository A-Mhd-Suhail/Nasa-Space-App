-- Email identity is case-insensitive and whitespace-free: the application stores lower(btrim(email)), and the
-- database now refuses anything else. Additive: verified against production (78 users, 0 violations) before applying.
-- Policy: only case-folding and trimming; Gmail dots and +tags are NOT folded (they are distinct addresses).
ALTER TABLE "user" DROP CONSTRAINT IF EXISTS "user_email_normalized_chk";
--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_email_normalized_chk" CHECK ("email" = lower(btrim("email")));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_email_lower_unique" ON "user" (lower("email"));
