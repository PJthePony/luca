CREATE TABLE "ignored_calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"calendar_id" text NOT NULL,
	"google_event_id" text NOT NULL,
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ignored_calendar_events" ADD CONSTRAINT "ignored_calendar_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_ignored_events_user_cal_event" ON "ignored_calendar_events" USING btree ("user_id","calendar_id","google_event_id");--> statement-breakpoint
CREATE INDEX "idx_ignored_events_user" ON "ignored_calendar_events" USING btree ("user_id");