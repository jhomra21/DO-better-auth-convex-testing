import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';

export const canvasRooms = sqliteTable('canvas_rooms', {
  id: text('id').primaryKey().notNull(),
  name: text('name').notNull(),
  description: text('description'),
  creator_id: text('creator_id').notNull(),
  is_public: integer('is_public', { mode: 'boolean' }).default(false),
  max_participants: integer('max_participants').default(10),
  created: integer('created', { mode: 'timestamp' }).notNull(),
  updated: integer('updated', { mode: 'timestamp' }).notNull(),
});

export const canvasParticipants = sqliteTable('canvas_participants', {
  id: text('id').primaryKey().notNull(),
  room_id: text('room_id').notNull(),
  user_id: text('user_id').notNull(),
  role: text('role', { enum: ['owner', 'editor', 'viewer'] }).notNull().default('viewer'),
  joined: integer('joined', { mode: 'timestamp' }).notNull(),
  last_active: integer('last_active', { mode: 'timestamp' }).notNull(),
});

export const canvasInvites = sqliteTable('canvas_invites', {
  id: text('id').primaryKey().notNull(),
  room_id: text('room_id').notNull(),
  email: text('email'),
  token: text('token').notNull().unique(),
  created_by_user_id: text('created_by_user_id').notNull(),
  status: text('status', { enum: ['pending', 'accepted', 'expired', 'revoked'] }).notNull().default('pending'),
  created: integer('created', { mode: 'timestamp' }).notNull(),
  expires: integer('expires', { mode: 'timestamp' }).notNull(),
  used: integer('used', { mode: 'timestamp' }),
}); 