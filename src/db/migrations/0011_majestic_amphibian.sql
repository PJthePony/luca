CREATE TABLE "email_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"short_code" text NOT NULL,
	"intent" text NOT NULL,
	"to_emails" text[] NOT NULL,
	"bcc_emails" text[],
	"subject" text NOT NULL,
	"composed_text" text NOT NULL,
	"extracted_data" jsonb,
	"composer_output" jsonb,
	"qc_result" jsonb,
	"status" text DEFAULT 'pending_qc' NOT NULL,
	"edited_text" text,
	"is_simulated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	CONSTRAINT "email_drafts_short_code_unique" UNIQUE("short_code")
);
--> statement-breakpoint
ALTER TABLE "email_drafts" ADD CONSTRAINT "email_drafts_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_drafts" ADD CONSTRAINT "email_drafts_thread_id_email_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."email_threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_email_drafts_meeting" ON "email_drafts" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "idx_email_drafts_status" ON "email_drafts" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_email_drafts_short_code" ON "email_drafts" USING btree ("short_code");