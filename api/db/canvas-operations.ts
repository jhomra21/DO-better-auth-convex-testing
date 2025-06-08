import { eq, and, desc } from 'drizzle-orm';
import type { CanvasD1DB, NewCanvasRoom, CanvasRoom, NewCanvasParticipant, CanvasParticipant, NewCanvasInvite, CanvasInvite } from './canvas-types';
import { canvasRooms, canvasParticipants, canvasInvites } from './canvas-schema';

// Explicit type for creating a canvas room, reflecting new fields
export interface CreateCanvasRoomData {
  name: string;
  creator_id: string;
  description?: string | null;
  is_public?: boolean;
  max_participants?: number;
}

// TODO: Implement actual operations as needed. These are examples.

/**
 * Canvas Rooms Operations
 */
export async function createCanvasRoom(db: CanvasD1DB, roomData: CreateCanvasRoomData): Promise<CanvasRoom> {
  const newId = crypto.randomUUID();
  const now = new Date();
  const valuesToInsert: NewCanvasRoom = {
    id: newId,
    name: roomData.name,
    creator_id: roomData.creator_id,
    created: now,
    updated: now,
  };

  if (roomData.description !== undefined) {
    valuesToInsert.description = roomData.description;
  }
  if (roomData.is_public !== undefined) {
    valuesToInsert.is_public = roomData.is_public;
  }
  if (roomData.max_participants !== undefined) {
    valuesToInsert.max_participants = roomData.max_participants;
  }

  const [room] = await db.insert(canvasRooms).values(valuesToInsert).returning();
  return room;
}

export async function getCanvasRoomById(db: CanvasD1DB, roomId: string): Promise<CanvasRoom | undefined> {
  return await db.select().from(canvasRooms).where(eq(canvasRooms.id, roomId)).get();
}

export async function getAllCanvasRoomsForUser(db: CanvasD1DB, userId: string): Promise<CanvasRoom[]> {
  // Fetch rooms where the user is the creator.
  // Future enhancement: could also fetch rooms where the user is a participant by joining with canvasParticipants.
  return await db.select()
    .from(canvasRooms)
    .where(eq(canvasRooms.creator_id, userId))
    .orderBy(desc(canvasRooms.updated)) // Order by most recently updated
    .all();
}

export async function updateCanvasRoomSettings(
  db: CanvasD1DB, 
  roomId: string, 
  userId: string, // ID of the user attempting the update
  settings: Partial<Pick<CanvasRoom, 'name' | 'description' | 'is_public' | 'max_participants'>>
): Promise<CanvasRoom> {
  const room = await db.select().from(canvasRooms).where(eq(canvasRooms.id, roomId)).get();

  if (!room) {
    throw new Error('Room not found'); // Or a more specific error type
  }

  if (room.creator_id !== userId) {
    throw new Error('Unauthorized: Only the room creator can change settings.'); // Or a specific auth error
  }

  const updatePayload: Partial<NewCanvasRoom> = { ...settings };
  if (Object.keys(updatePayload).length === 0) {
    return room; // No actual changes, return current room
  }
  
  updatePayload.updated = new Date();

  const [updatedRoom] = await db.update(canvasRooms)
    .set(updatePayload)
    .where(eq(canvasRooms.id, roomId))
    .returning();
  
  if (!updatedRoom) {
    // This case should ideally not happen if the room existed and update didn't throw an SQL error
    throw new Error('Failed to update room settings.');
  }
  return updatedRoom;
}

// Add more operations for canvasRooms (e.g., delete, list by user)

/**
 * Canvas Participants Operations
 */

interface AddParticipantData {
    room_id: string;
    user_id: string;
    role?: 'owner' | 'editor' | 'viewer';
}

export async function addParticipantToRoom(db: CanvasD1DB, participantData: AddParticipantData): Promise<CanvasParticipant> {
  const newId = crypto.randomUUID();
  const now = new Date();
  const valuesToInsert: NewCanvasParticipant = {
    id: newId,
    room_id: participantData.room_id,
    user_id: participantData.user_id,
    joined: now,
    last_active: now,
  };
  if (participantData.role) {
    valuesToInsert.role = participantData.role;
  }
  // Drizzle will use the default 'viewer' for role if not provided here and if schema default is active

  const [participant] = await db.insert(canvasParticipants).values(valuesToInsert).returning();
  return participant;
}

export async function getParticipantsByRoomId(db: CanvasD1DB, roomId: string): Promise<CanvasParticipant[]> {
  return await db.select().from(canvasParticipants).where(eq(canvasParticipants.room_id, roomId)).all();
}

// Add more operations for canvasParticipants (e.g., remove, update role)

/**
 * Canvas Invites Operations
 */

interface CreateCanvasInviteData {
    room_id: string;
    created_by_user_id: string;
    expires: Date;
    email?: string | null;
}

export async function createCanvasInvite(db: CanvasD1DB, inviteData: CreateCanvasInviteData): Promise<CanvasInvite> {
  const newId = crypto.randomUUID();
  const newToken = crypto.randomUUID(); 
  const now = new Date();
  
  const valuesToInsert: NewCanvasInvite = {
    id: newId,
    room_id: inviteData.room_id,
    created_by_user_id: inviteData.created_by_user_id,
    token: newToken,
    status: 'pending', // Default status
    created: now,
    expires: inviteData.expires,
    // 'used' will be null by default as per schema (nullable field)
  };
  if (inviteData.email !== undefined) {
    valuesToInsert.email = inviteData.email;
  }

  const [invite] = await db.insert(canvasInvites).values(valuesToInsert).returning();
  return invite;
}

export async function getCanvasInviteByToken(db: CanvasD1DB, token: string): Promise<CanvasInvite | undefined> {
  return await db.select().from(canvasInvites).where(eq(canvasInvites.token, token)).get();
}

// Add more operations for canvasInvites (e.g., update status)

// Note: Ensure error handling, and consider if these operations should be part of the Durable Object 
// or directly accessed via Hono routes (which might be less common if state is managed in DO). 