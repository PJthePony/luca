import { db } from "../db/index.js";
import { availabilityRules, meetingTypes } from "../db/schema.js";

const DEFAULT_MEETING_TYPES = [
  { name: "Coffee", slug: "coffee", isOnline: false, defaultDuration: 60, isDefault: false },
  { name: "Video Call", slug: "video_call", isOnline: true, defaultDuration: 30, isDefault: true },
  { name: "Lunch", slug: "lunch", isOnline: false, defaultDuration: 60, isDefault: false },
  { name: "Quick Chat", slug: "quick_chat", isOnline: true, defaultDuration: 15, isDefault: false },
  { name: "Phone Call", slug: "phone_call", isOnline: true, defaultDuration: 30, isDefault: false },
  { name: "Drinks", slug: "drinks", isOnline: false, defaultDuration: 60, isDefault: false },
];

/** Seed default availability (Mon-Fri 9am-5pm) and meeting types for a new user. */
export async function seedDefaults(userId: string) {
  for (let day = 1; day <= 5; day++) {
    await db.insert(availabilityRules).values({
      userId,
      dayOfWeek: day,
      startTime: "09:00",
      endTime: "17:00",
    });
  }

  for (const mt of DEFAULT_MEETING_TYPES) {
    await db
      .insert(meetingTypes)
      .values({ userId, ...mt })
      .onConflictDoNothing();
  }
}
