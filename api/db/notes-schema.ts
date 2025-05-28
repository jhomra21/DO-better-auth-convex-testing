import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const notes = sqliteTable("notes", {
  id: text("id")
    .notNull()
    .primaryKey()
    .$defaultFn(() => `note_${randomString()}`),
  text: text("text").notNull(),
  userId: text("user_id").notNull(), // Reference to Better Auth user
  created: integer("created", { mode: "timestamp_ms" })
    .$defaultFn(() => new Date())
    .notNull(),
  updated: integer("updated", { mode: "timestamp_ms" })
    .$onUpdate(() => new Date())
    .notNull(),
});

function randomString(length = 16): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const resultArray = new Array(length);
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    resultArray[i] = chars[randomIndex];
  }
  return resultArray.join("");
} 