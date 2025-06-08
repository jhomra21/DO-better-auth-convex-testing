import { drizzle } from 'drizzle-orm/d1'; // Use drizzle-orm/d1 for D1 database
import * as schema from './canvas-schema';
import type { D1Database } from '@cloudflare/workers-types';

// Type for D1 database instance with canvas schema
// This is useful when you interact with D1 directly (e.g., in Hono routes or DO if not using durable-sqlite)
export type CanvasD1DB = ReturnType<typeof drizzle<typeof schema>>;
export const getCanvasD1DB = (d1: D1Database) => drizzle(d1, { schema });

// Individual table types for select (reading data) and insert (creating new records)
export type CanvasRoom = typeof schema.canvasRooms.$inferSelect;
export type NewCanvasRoom = typeof schema.canvasRooms.$inferInsert;

export type CanvasParticipant = typeof schema.canvasParticipants.$inferSelect;
export type NewCanvasParticipant = typeof schema.canvasParticipants.$inferInsert;

export type CanvasInvite = typeof schema.canvasInvites.$inferSelect;
export type NewCanvasInvite = typeof schema.canvasInvites.$inferInsert; 