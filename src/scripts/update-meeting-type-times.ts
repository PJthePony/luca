import "dotenv/config";
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, meetingTypes } from "../db/schema.js";

/**
 * Set time windows on existing meeting types:
 * - Coffee: 07:00 - 11:00 (morning)
 * - Lunch: 11:30 - 13:30
 * - Drinks: 16:00 - 18:00 (add this type if it doesn't exist)
 */

const email = process.argv[2] || "pjtanzillo@gmail.com";

const user = await db.query.users.findFirst({
  where: eq(users.email, email),
});

if (!user) {
  console.error(`User ${email} not found`);
  process.exit(1);
}

// Coffee: morning only
await db
  .update(meetingTypes)
  .set({ earliestTime: "07:00", latestTime: "11:00" })
  .where(and(eq(meetingTypes.userId, user.id), eq(meetingTypes.slug, "coffee")));
console.log("Coffee → 07:00 - 11:00");

// Lunch: 11:30 - 13:30
await db
  .update(meetingTypes)
  .set({ earliestTime: "11:30", latestTime: "13:30" })
  .where(and(eq(meetingTypes.userId, user.id), eq(meetingTypes.slug, "lunch")));
console.log("Lunch → 11:30 - 13:30");

// Drinks: create if doesn't exist, then set times
const existingDrinks = await db.query.meetingTypes.findFirst({
  where: and(eq(meetingTypes.userId, user.id), eq(meetingTypes.slug, "drinks")),
});

if (!existingDrinks) {
  await db.insert(meetingTypes).values({
    userId: user.id,
    name: "Drinks",
    slug: "drinks",
    isOnline: false,
    defaultDuration: 60,
    defaultLocation: null,
    earliestTime: "16:00",
    latestTime: "18:00",
    isDefault: false,
  });
  console.log("Created Drinks → 16:00 - 18:00");
} else {
  await db
    .update(meetingTypes)
    .set({ earliestTime: "16:00", latestTime: "18:00" })
    .where(eq(meetingTypes.id, existingDrinks.id));
  console.log("Drinks → 16:00 - 18:00");
}

console.log("Done!");
process.exit(0);
