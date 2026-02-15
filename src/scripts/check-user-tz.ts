import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";

async function main() {
  const user = await db.query.users.findFirst({
    where: eq(users.id, "5d32db29-c522-4410-97ee-8d68b89c8545"),
  });
  console.log("User timezone:", user?.timezone);
  console.log("User name:", user?.name);
  process.exit(0);
}
main();
