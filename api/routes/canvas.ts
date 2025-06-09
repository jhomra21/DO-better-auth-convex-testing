import { Hono } from 'hono';
import { getCanvasD1DB, type CanvasRoom, type NewCanvasRoom } from '../db/canvas-types';
import { 
  createCanvasRoom as dbCreateCanvasRoom, 
  getCanvasRoomById as dbGetCanvasRoomById,
  updateCanvasRoomSettings as dbUpdateCanvasRoomSettings,
  getAllCanvasRoomsForUser as dbGetAllCanvasRoomsForUser // Assuming we'll create this
} from '../db/canvas-operations';
import type { CreateCanvasRoomData } from '../db/canvas-operations'; // Import the specific input type
import { authMiddleware } from '../lib/authMiddleware';
// We might not need getCanvasRoomStub here if these are purely D1 operations before a DO is involved for real-time.
// import { getCanvasRoomStub } from '../lib/durableObjects'; 

// Define environment type matching api/index.ts & durableObjects.ts helper
type Env = {
  DB: D1Database; // D1 binding for direct database access
  CANVAS_ROOM: DurableObjectNamespace; // DO binding, might be used if HTTP routes trigger DO actions
  // Add other relevant bindings from wrangler.jsonc if needed
  [key: string]: any;
};

// Define Hono variables (user context, etc.)
// Assuming authentication middleware will populate c.get('user')
interface HonoVariables {
  user?: { id: string; [key: string]: any }; // Optional user, enforce auth per route
  // Add other variables if used by middleware
}

export const canvasRouter = new Hono<{ Bindings: Env; Variables: HonoVariables }>()
  // This middleware can be simplified or removed if the global auth middleware handles setting the user.
  // If specific canvas-level checks are needed later, they can be added here.
  .use('*', authMiddleware)

  // List all canvas rooms (e.g., created by the user or public)
  .get('/rooms', async (c) => {
    const user = c.get('user'); // This will now rely on the global middleware's setting of user
    if (!user || !user.id) {
      return c.json({ error: 'Unauthorized', message: 'Authentication required to list rooms.' }, 401);
    }

    try {
      const db = getCanvasD1DB(c.env.DB);
      // TODO: Implement dbGetAllCanvasRoomsForUser or a similar function
      // This function would ideally handle pagination and filtering based on user permissions.
      // For now, let's assume it fetches rooms the user has access to.
      const rooms = await dbGetAllCanvasRoomsForUser(db, user.id);
      return c.json(rooms); // Return array directly, or { rooms: rooms }
    } catch (error: any) {
      console.error('Error fetching canvas rooms:', error);
      return c.json({ error: 'Failed to fetch rooms', message: error.message || 'Internal server error' }, 500);
    }
  })

  // Create a new canvas room
  .post('/rooms', async (c) => {
    const user = c.get('user'); // This will now rely on the global middleware's setting of user
    if (!user || !user.id) {
      return c.json({ error: 'Unauthorized', message: 'Authentication required to create a room.' }, 401);
    }

    try {
      // Expect name, and optional description, is_public, max_participants
      const body = await c.req.json<{ name: string; description?: string; is_public?: boolean; max_participants?: number }>();
      
      if (!body.name || typeof body.name !== 'string' || body.name.trim() === '') {
        return c.json({ error: 'Invalid input', message: 'Room name is required.' }, 400);
      }

      const db = getCanvasD1DB(c.env.DB);
      // Construct data according to CreateCanvasRoomData interface
      const newRoomData: CreateCanvasRoomData = {
        name: body.name.trim(),
        creator_id: user.id,
      };
      if (body.description !== undefined) newRoomData.description = body.description;
      if (body.is_public !== undefined) newRoomData.is_public = body.is_public;
      if (body.max_participants !== undefined) newRoomData.max_participants = body.max_participants;

      const createdRoom = await dbCreateCanvasRoom(db, newRoomData);
      
      // Optionally, here you could also ensure the CanvasRoom DO is initialized or 'warmed up'
      // const roomStub = getCanvasRoomStub(c.env, createdRoom.id);
      // await roomStub.fetch(new Request(`https://do-dummy/init`, { method: 'POST' })); // Example init call

      return c.json({ message: 'Room created successfully', room: createdRoom }, 201);
    } catch (error: any) {
      console.error('Error creating canvas room:', error);
      return c.json({ error: 'Failed to create room', message: error.message || 'Internal server error' }, 500);
    }
  })

  // Get details for a specific canvas room
  .get('/rooms/:roomId', async (c) => {
    const user = c.get('user'); // For potential permission checks
    const roomId = c.req.param('roomId');
    if (!roomId) {
      return c.json({ error: 'Invalid input', message: 'Room ID is required.' }, 400);
    }

    try {
      const db = getCanvasD1DB(c.env.DB);
      const room = await dbGetCanvasRoomById(db, roomId);

      if (!room) {
        return c.json({ error: 'Not found', message: 'Room not found.' }, 404);
      }
      
      // TODO: Add logic to check if the user (from c.get('user')) has permission to view this room if it's private
      // This might involve checking the canvasParticipants table.

      return c.json(room);
    } catch (error: any) {
      console.error(`Error fetching room ${roomId}:`, error);
      return c.json({ error: 'Failed to fetch room', message: error.message || 'Internal server error' }, 500);
    }
  })

  // Update settings for a specific canvas room
  .put('/rooms/:roomId/settings', async (c) => {
    const user = c.get('user'); // This will now rely on the global middleware's setting of user
    if (!user || !user.id) {
      return c.json({ error: 'Unauthorized', message: 'Authentication required to update room settings.' }, 401);
    }

    const roomId = c.req.param('roomId');
    if (!roomId) {
      return c.json({ error: 'Invalid input', message: 'Room ID is required.' }, 400);
    }

    try {
      const { name, description, is_public, max_participants } = await c.req.json<{
        name?: string;
        description?: string;
        is_public?: boolean;
        max_participants?: number;
      }>();

      const settingsToUpdate: Partial<Pick<CanvasRoom, 'name' | 'description' | 'is_public' | 'max_participants'>> = {};
      if (name !== undefined) settingsToUpdate.name = name.trim();
      if (description !== undefined) settingsToUpdate.description = description;
      if (is_public !== undefined) settingsToUpdate.is_public = is_public;
      if (max_participants !== undefined) settingsToUpdate.max_participants = max_participants;

      if (Object.keys(settingsToUpdate).length === 0) {
        return c.json({ error: 'No settings provided', message: 'Please provide at least one setting to update.' }, 400);
      }
      if (settingsToUpdate.name === '') {
        return c.json({ error: 'Invalid input', message: 'Room name cannot be empty.'}, 400);
      }

      const db = getCanvasD1DB(c.env.DB);
      const updatedRoom = await dbUpdateCanvasRoomSettings(db, roomId, user.id, settingsToUpdate);

      return c.json({ message: 'Room settings updated successfully', room: updatedRoom });
    } catch (error: any) {
      console.error(`Error updating settings for room ${roomId}:`, error);
      if (error.message.includes('Unauthorized')) {
        return c.json({ error: 'Forbidden', message: error.message }, 403);
      }
      if (error.message.includes('Room not found')) {
        return c.json({ error: 'Not found', message: error.message }, 404);
      }
      return c.json({ error: 'Failed to update room settings', message: error.message || 'Internal server error' }, 500);
    }
  });

// TODO: Add more routes as needed:
// - GET /rooms (list rooms, with pagination and filtering, check user permissions)
// - PUT /rooms/:roomId (update room settings, requires owner/admin privileges)
// - DELETE /rooms/:roomId (delete a room, requires owner privileges)
// - POST /rooms/:roomId/participants (add a participant)
// - DELETE /rooms/:roomId/participants/:userId (remove a participant)
// - POST /rooms/:roomId/invites (create an invitation link/email) 