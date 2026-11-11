CREATE TABLE "saved_locations" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"latitude_deg" double precision NOT NULL,
	"longitude_east_deg" double precision NOT NULL,
	"site_id" text,
	"note" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "personal" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "saved_locations" ADD CONSTRAINT "saved_locations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_locations" ADD CONSTRAINT "saved_locations_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_locations" ADD CONSTRAINT "saved_locations_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "saved_locations_ws_idx" ON "saved_locations" USING btree ("workspace_id","created_at");--> statement-breakpoint
-- Existing workspaces were all created as personal workspaces (one per owner).
UPDATE "workspaces" SET "personal" = true WHERE "id" IN (SELECT DISTINCT ON ("owner_user_id") "id" FROM "workspaces" ORDER BY "owner_user_id", "created_at");
