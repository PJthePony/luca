DROP INDEX "idx_meeting_types_user_slug";--> statement-breakpoint
CREATE UNIQUE INDEX "idx_meeting_types_user_name" ON "meeting_types" USING btree ("user_id","name");--> statement-breakpoint
ALTER TABLE "meeting_types" DROP COLUMN "slug";