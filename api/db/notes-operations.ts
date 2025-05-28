import { eq, and } from "drizzle-orm";
import { notes } from "./notes-schema";
import type { NotesDB, InsertNote, Note } from "./notes-types";

export async function getNotes(db: NotesDB, userId: string): Promise<Note[]> {
  return await db
    .select()
    .from(notes)
    .where(eq(notes.userId, userId));
}

export async function createNote(db: NotesDB, note: Omit<InsertNote, 'id' | 'created' | 'updated'>): Promise<Note> {
  const [result] = await db
    .insert(notes)
    .values(note)
    .returning();
  return result;
}

export async function updateNote(db: NotesDB, noteId: string, userId: string, updates: Partial<Pick<Note, 'text'>>): Promise<Note | null> {
  const [result] = await db
    .update(notes)
    .set({ ...updates, updated: new Date() })
    .where(and(eq(notes.id, noteId), eq(notes.userId, userId)))
    .returning();
  return result || null;
}

export async function deleteNote(db: NotesDB, noteId: string, userId: string): Promise<Note | null> {
  const [result] = await db
    .delete(notes)
    .where(and(eq(notes.id, noteId), eq(notes.userId, userId)))
    .returning();
  return result || null;
} 