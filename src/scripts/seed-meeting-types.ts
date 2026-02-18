import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, meetingTypes } from "../db/schema.js";

const DEFAULT_MEETING_TYPES = [
  { name: "Coffee", isOnline: false, defaultDuration: 60, isDefault: false },
  { name: "Video Call", isOnline: true, defaultDuration: 30, isDefault: true },
  { name: "Lunch", isOnline: false, defaultDuration: 60, isDefault: false },
  { name: "Quick Chat", isOnline: true, defaultDuration: 15, isDefault: false },
  { name: "Phone Call", isOnline: true, defaultDuration: 30, isDefault: false },
];

async function seedMeetingTypes() {
  const email = process.argv[2];

  if (!email) {
    console.error("Usage: npx tsx src/scripts/seed-meeting-types.ts <email>");
    process.exit(1);
  }

  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (!user) {
    console.error(`User with email ${email} not found`);
    process.exit(1);
  }

  for (const mt of DEFAULT_MEETING_TYPES) {
    await db
      .insert(meetingTypes)
      .values({
        userId: user.id,
        ...mt,
      })
      .onConflictDoNothing();
  }

  console.log(`Seeded ${DEFAULT_MEETING_TYPES.length} meeting types for ${user.name} (${user.email})`);
  process.exit(0);
}

seedMeetingTypes().catch(console.error);
