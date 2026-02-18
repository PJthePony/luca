import { db } from "../db/index.js";
import { availabilityRules, meetingTypes } from "../db/schema.js";

const DEFAULT_MEETING_TYPES = [
  { name: "Coffee", slug: "coffee", isOnline: false, defaultDuration: 60, isDefault: false, addGoogleMeet: false, collectPhoneNumber: false },
  { name: "Video Call", slug: "video_call", isOnline: true, defaultDuration: 30, isDefault: true, addGoogleMeet: true, collectPhoneNumber: false },
  { name: "Lunch", slug: "lunch", isOnline: false, defaultDuration: 60, isDefault: false, addGoogleMeet: false, collectPhoneNumber: false },
  { name: "Quick Chat", slug: "quick_chat", isOnline: true, defaultDuration: 15, isDefault: false, addGoogleMeet: true, collectPhoneNumber: false },
  { name: "Phone Call", slug: "phone_call", isOnline: true, defaultDuration: 30, isDefault: false, addGoogleMeet: false, collectPhoneNumber: true },
  { name: "Drinks", slug: "drinks", isOnline: false, defaultDuration: 60, isDefault: false, addGoogleMeet: false, collectPhoneNumber: false },
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
