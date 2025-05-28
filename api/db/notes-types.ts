import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import type * as schema from "./notes-schema";
import { notes } from "./notes-schema";

export type NotesDB = DrizzleSqliteDODatabase<typeof schema>;
export type Note = typeof notes.$inferSelect;
export type InsertNote = typeof notes.$inferInsert; 