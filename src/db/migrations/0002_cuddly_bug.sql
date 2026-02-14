CREATE TABLE "meeting_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_type_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"is_online" boolean DEFAULT true NOT NULL,
	"default_duration" integer DEFAULT 30 NOT NULL,
	"default_location" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_calendars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"calendar_id" text NOT NULL,
	"summary" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"check_for_conflicts" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "meeting_type_id" uuid;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "confirmed_location_id" uuid;--> statement-breakpoint
ALTER TABLE "meeting_locations" ADD CONSTRAINT "meeting_locations_meeting_type_id_meeting_types_id_fk" FOREIGN KEY ("meeting_type_id") REFERENCES "public"."meeting_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_types" ADD CONSTRAINT "meeting_types_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_calendars" ADD CONSTRAINT "user_calendars_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_meeting_locations_type" ON "meeting_locations" USING btree ("meeting_type_id");--> statement-breakpoint
CREATE INDEX "idx_meeting_types_user" ON "meeting_types" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_meeting_types_user_slug" ON "meeting_types" USING btree ("user_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_user_calendars_user_calendar" ON "user_calendars" USING btree ("user_id","calendar_id");--> statement-breakpoint
CREATE INDEX "idx_user_calendars_user" ON "user_calendars" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_meeting_type_id_meeting_types_id_fk" FOREIGN KEY ("meeting_type_id") REFERENCES "public"."meeting_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_confirmed_location_id_meeting_locations_id_fk" FOREIGN KEY ("confirmed_location_id") REFERENCES "public"."meeting_locations"("id") ON DELETE no action ON UPDATE no action;