CREATE TABLE "availability_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"day_of_week" smallint NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"message_id_header" text NOT NULL,
	"from_email" text NOT NULL,
	"from_name" text,
	"to_emails" text[] NOT NULL,
	"cc_emails" text[],
	"bcc_emails" text[],
	"subject" text NOT NULL,
	"body_text" text,
	"body_html" text,
	"direction" text NOT NULL,
	"parsed_intent" jsonb,
	"raw_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"message_ids" text[] DEFAULT '{}' NOT NULL,
	"last_message_id" text,
	"bcc_moved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"short_id" text NOT NULL,
	"organizer_id" uuid NOT NULL,
	"title" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"duration_min" integer DEFAULT 30 NOT NULL,
	"location" text,
	"notes" text,
	"confirmed_start" timestamp with time zone,
	"confirmed_end" timestamp with time zone,
	"google_event_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meetings_short_id_unique" UNIQUE("short_id")
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"role" text DEFAULT 'attendee' NOT NULL,
	"rsvp_status" text DEFAULT 'pending' NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposed_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"is_selected" boolean DEFAULT false NOT NULL,
	"tentative_event_ids" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"google_tokens" jsonb,
	"imessage_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_thread_id_email_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."email_threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_organizer_id_users_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposed_slots" ADD CONSTRAINT "proposed_slots_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_availability_rules_user" ON "availability_rules" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_email_messages_thread" ON "email_messages" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "idx_email_messages_message_id" ON "email_messages" USING btree ("message_id_header");--> statement-breakpoint
CREATE INDEX "idx_email_threads_meeting" ON "email_threads" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "idx_meetings_organizer" ON "meetings" USING btree ("organizer_id");--> statement-breakpoint
CREATE INDEX "idx_meetings_status" ON "meetings" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_participants_meeting_email" ON "participants" USING btree ("meeting_id","email");--> statement-breakpoint
CREATE INDEX "idx_participants_email" ON "participants" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_proposed_slots_meeting" ON "proposed_slots" USING btree ("meeting_id");