import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  smallint,
  integer,
  time,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ── Users ────────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull().default("America/New_York"),
  supabaseId: text("supabase_id"),
  googleTokens: jsonb("google_tokens"),
  imessageId: text("imessage_id"),
  workEmail: text("work_email"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── Availability Rules ───────────────────────────────────────────────────────

export const availabilityRules = pgTable(
  "availability_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    dayOfWeek: smallint("day_of_week").notNull(), // 0=Sunday, 6=Saturday
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_availability_rules_user").on(table.userId)],
);

// ── User Calendars ──────────────────────────────────────────────────────────

export const userCalendars = pgTable(
  "user_calendars",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    calendarId: text("calendar_id").notNull(), // Google Calendar ID (email or hash)
    summary: text("summary").notNull(), // Display name
    isPrimary: boolean("is_primary").notNull().default(false),
    checkForConflicts: boolean("check_for_conflicts").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_user_calendars_user_calendar").on(table.userId, table.calendarId),
    index("idx_user_calendars_user").on(table.userId),
  ],
);

// ── Meeting Types ───────────────────────────────────────────────────────────

export const meetingTypes = pgTable(
  "meeting_types",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    isOnline: boolean("is_online").notNull().default(true),
    defaultDuration: integer("default_duration").notNull().default(30), // minutes
    defaultLocation: text("default_location"),
    earliestTime: time("earliest_time"), // e.g. "07:00" — null means no constraint
    latestTime: time("latest_time"), // e.g. "11:00" — null means no constraint
    addGoogleMeet: boolean("add_google_meet").notNull().default(false),
    collectPhoneNumber: boolean("collect_phone_number").notNull().default(false),
    isDefault: boolean("is_default").notNull().default(false), // default meeting type for this user
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_meeting_types_user").on(table.userId),
    uniqueIndex("idx_meeting_types_user_name").on(table.userId, table.name),
  ],
);

// ── Meeting Locations ───────────────────────────────────────────────────────

export const meetingLocations = pgTable(
  "meeting_locations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    meetingTypeId: uuid("meeting_type_id")
      .notNull()
      .references(() => meetingTypes.id),
    name: text("name").notNull(), // e.g. "Blue Bottle Coffee"
    address: text("address"),
    notes: text("notes"), // e.g. "On the 2nd floor"
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_meeting_locations_type").on(table.meetingTypeId),
  ],
);

// ── Meetings ─────────────────────────────────────────────────────────────────

export const meetings = pgTable(
  "meetings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shortId: text("short_id").notNull().unique(),
    organizerId: uuid("organizer_id")
      .notNull()
      .references(() => users.id),
    title: text("title"),
    status: text("status").notNull().default("draft"),
    durationMin: integer("duration_min").notNull().default(30),
    meetingTypeId: uuid("meeting_type_id").references(() => meetingTypes.id),
    location: text("location"),
    confirmedLocationId: uuid("confirmed_location_id").references(() => meetingLocations.id),
    notes: text("notes"),
    agenda: text("agenda").array().notNull().default([]),
    confirmedStart: timestamp("confirmed_start", { withTimezone: true }),
    confirmedEnd: timestamp("confirmed_end", { withTimezone: true }),
    googleEventId: text("google_event_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_meetings_organizer").on(table.organizerId),
    index("idx_meetings_status").on(table.status),
  ],
);

// ── Participants ─────────────────────────────────────────────────────────────

export const participants = pgTable(
  "participants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id),
    email: text("email").notNull(),
    name: text("name"),
    role: text("role").notNull().default("attendee"),
    rsvpStatus: text("rsvp_status").notNull().default("pending"),
    userId: uuid("user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_participants_meeting_email").on(
      table.meetingId,
      table.email,
    ),
    index("idx_participants_email").on(table.email),
  ],
);

// ── Proposed Slots ───────────────────────────────────────────────────────────

export const proposedSlots = pgTable(
  "proposed_slots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id),
    startTime: timestamp("start_time", { withTimezone: true }).notNull(),
    endTime: timestamp("end_time", { withTimezone: true }).notNull(),
    isSelected: boolean("is_selected").notNull().default(false),
    tentativeEventIds: jsonb("tentative_event_ids"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_proposed_slots_meeting").on(table.meetingId)],
);

// ── Email Threads ────────────────────────────────────────────────────────────

export const emailThreads = pgTable(
  "email_threads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id),
    subject: text("subject").notNull(),
    messageIds: text("message_ids").array().notNull().default([]),
    lastMessageId: text("last_message_id"),
    bccMoved: boolean("bcc_moved").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_email_threads_meeting").on(table.meetingId)],
);

// ── Email Messages ───────────────────────────────────────────────────────────

export const emailMessages = pgTable(
  "email_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => emailThreads.id),
    messageIdHeader: text("message_id_header").notNull(),
    fromEmail: text("from_email").notNull(),
    fromName: text("from_name"),
    toEmails: text("to_emails").array().notNull(),
    ccEmails: text("cc_emails").array(),
    bccEmails: text("bcc_emails").array(),
    subject: text("subject").notNull(),
    bodyText: text("body_text"),
    bodyHtml: text("body_html"),
    direction: text("direction").notNull(), // 'inbound' | 'outbound'
    parsedIntent: jsonb("parsed_intent"),
    rawPayload: jsonb("raw_payload"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_email_messages_thread").on(table.threadId),
    index("idx_email_messages_message_id").on(table.messageIdHeader),
  ],
);
