import "dotenv/config";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";

const all = await db.select().from(users);
console.log(JSON.stringify(all.map(u => ({ id: u.id, email: u.email, name: u.name })), null, 2));
process.exit(0);
