# Luca — Calendar Manager

Luca is P.J.'s AI-powered calendar scheduling assistant. Part of the tanzillo.ai family (Godfather-themed personal productivity suite).

## What It Does
CC Luca on any email and it figures out when everyone's free. It parses meeting requests from natural language emails, finds availability across participants' Google Calendars, proposes time slots, and books meetings.

## Status: Live

## Tech Stack
- **Runtime**: Node.js with TypeScript (tsx)
- **Framework**: Hono (lightweight web framework)
- **Database**: PostgreSQL via Drizzle ORM
- **Queue**: BullMQ + Redis (for async email processing)
- **AI**: Anthropic Claude SDK (for parsing email intent and generating responses)
- **Calendar**: Google APIs (Calendar)
- **Email**: Mailgun (inbound/outbound)
- **Auth**: jose (JWT)
- **Hosting**: Railway

## Project Structure
```
src/
  index.ts              # App entry point
  config.ts             # Environment config
  db/
    schema.ts           # Drizzle database schema
    index.ts            # DB connection
    migrations/         # Drizzle migrations
  routes/
    auth.ts             # Authentication endpoints
    dashboard.ts        # Dashboard/UI endpoints
    join.ts             # User onboarding
    meetings.ts         # Meeting management
    settings.ts         # User settings
    webhooks.ts         # Inbound email webhooks (Mailgun)
  services/
    ai-parser.ts        # Claude-powered email intent parsing
    email.ts            # Email sending via Mailgun
    intent-handlers.ts  # Routes parsed intents to actions
    meeting-machine.ts  # State machine for meeting lifecycle
    notification.ts     # Notification delivery
    queries.ts          # Database query helpers
    slot-proposer.ts    # Availability calculation & slot proposals
    thread-resolver.ts  # Email thread tracking
  scripts/
    seed-user.ts        # Seed initial user
    seed-meeting-types.ts # Seed meeting type templates
```

## Key Commands
- `npm run dev` — Start dev server with hot reload
- `npm run build` — TypeScript check
- `npm start` — Production start
- `npm run db:generate` — Generate Drizzle migrations
- `npm run db:migrate` — Run migrations
- `npm run db:studio` — Open Drizzle Studio

## How It Fits in the Family
- **Tessio** can check Luca for scheduling conflicts
- **Genco** (coming soon) will be able to route scheduling emails to Luca
- **Clemenza** (coming soon) will pull upcoming meetings from Luca for prep
- **Consigliere** (coming soon) will coordinate with Luca when planning projects that involve meetings
