import { db } from "../db/index.js";
import { meetingTypes } from "../db/schema.js";

async function main() {
  const types = await db.select().from(meetingTypes);
  for (const t of types) {
    console.log(`${t.slug}: earliest=${t.earliestTime}, latest=${t.latestTime}, duration=${t.defaultDuration}min`);
  }
  process.exit(0);
}
main();
