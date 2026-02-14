import "dotenv/config";
import { db } from "../db/index.js";
import { users, availabilityRules, meetingTypes } from "../db/schema.js";

async function seed() {
  const email = process.argv[2];
  const name = process.argv[3];

  if (!email || !name) {
    console.error("Usage: npm run seed <email> <name>");
    process.exit(1);
  }

  const [user] = await db
    .insert(users)
    .values({
      email,
      name,
      timezone: "America/New_York",
    })
    .onConflictDoNothing()
    .returning();

  if (!user) {
    console.log(`User with email ${email} already exists`);
    process.exit(0);
  }

  // Add default availability: Mon-Fri 9am-5pm
  for (let day = 1; day <= 5; day++) {
    await db.insert(availabilityRules).values({
      userId: user.id,
      dayOfWeek: day,
      startTime: "09:00",
      endTime: "17:00",
    });
  }

  // Seed default meeting types
  const defaultTypes = [
    { name: "Coffee", slug: "coffee", isOnline: false, defaultDuration: 60, isDefault: false },
    { name: "Video Call", slug: "video_call", isOnline: true, defaultDuration: 30, isDefault: true },
    { name: "Lunch", slug: "lunch", isOnline: false, defaultDuration: 60, isDefault: false },
    { name: "Quick Chat", slug: "quick_chat", isOnline: true, defaultDuration: 15, isDefault: false },
    { name: "Phone Call", slug: "phone_call", isOnline: true, defaultDuration: 30, isDefault: false },
  ];

  for (const mt of defaultTypes) {
    await db.insert(meetingTypes).values({ userId: user.id, ...mt });
  }

  console.log(`Created user: ${user.name} (${user.email})`);
  console.log(`ID: ${user.id}`);
  console.log(`Seeded 5 default meeting types`);
  console.log(`Connect Google Calendar: /auth/google?userId=${user.id}`);
  process.exit(0);
}

seed().catch(console.error);
