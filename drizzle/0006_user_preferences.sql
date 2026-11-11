CREATE TABLE "user_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"preferred_mode" text DEFAULT 'simple' NOT NULL,
	"units" text DEFAULT 'metric' NOT NULL,
	"time_zone" text DEFAULT 'UTC' NOT NULL,
	"scoring_weights" jsonb DEFAULT '{"sun":50,"dte":50,"energy":0}'::jsonb NOT NULL,
	"mission_thresholds" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"display" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;