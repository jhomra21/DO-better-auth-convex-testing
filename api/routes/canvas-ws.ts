import { Hono } from 'hono';
import { getCanvasRoomStub } from '../lib/durableObjects';

// Define environment type matching api/index.ts & durableObjects.ts helper
type Env = {
  DB: D1Database; // D1 binding for direct database access
  CANVAS_ROOM: DurableObjectNamespace; // DO binding for canvas
  USER_NOTES_DATABASE: DurableObjectNamespace; // DO binding for notes (required by getCanvasRoomStub's Env type)
  // Include your Better-Auth specific env vars if auth middleware needs them directly
  // BETTER_AUTH_SECRET: string;
  // BETTER_AUTH_URL: string;
  [key: string]: any;
};

// Define Hono variables (user context, etc.)
// Assuming authentication middleware will populate c.get('user')
interface HonoVariables {
  user?: { id: string; [key: string]: any }; // Populated by auth middleware
  auth?: any; // If your Better-Auth instance is set on context
  // Add other variables if used by middleware
}

export const canvasWebSocketRouter = new Hono<{ Bindings: Env; Variables: HonoVariables }>()
  // Authentication middleware for WebSocket connections
  // This needs to be robust and handle token-based auth typically passed via query params for WebSockets.
  .use('/:roomId/ws', async (c, next) => {
    let user = c.get('user'); // Check if auth middleware already ran (e.g., global middleware)

    if (!user) {
      const token = c.req.query('token'); // Standard way to pass token for WS
      if (!token) {
        return c.json({ error: 'Unauthorized', message: 'Auth token is required for WebSocket connection.' }, 401);
      }
      
      // Validate the token (this is a simplified example, adapt your Better-Auth validation)
      try {
        // Assuming your Better-Auth instance might be on c.env or you have a helper
        // This is a conceptual placeholder for token validation logic.
        // You might need to call a D1 query to validate the session token, similar to your /session endpoint.
        const sessionResult = await c.env.DB.prepare(
          "SELECT u.* FROM session s JOIN user u ON s.user_id = u.id WHERE s.token = ? AND s.expires_at > ?"
        ).bind(token, new Date()).first();

        if (sessionResult) {
          user = sessionResult as { id: string; [key: string]: any };
          c.set('user', user);
        } else {
          return c.json({ error: 'Unauthorized', message: 'Invalid or expired token.' }, 401);
        }
      } catch (e) {
        console.error("WebSocket Auth Error:", e);
        return c.json({ error: 'Unauthorized', message: 'Authentication error.' }, 401);
      }
    }
    await next();
  })

  // WebSocket endpoint for a specific canvas room
  .get('/:roomId/ws', async (c) => {
    const user = c.get('user');
    if (!user || !user.id) {
      // This check should ideally be redundant if the middleware above is effective
      return c.json({ error: 'Unauthorized', message: 'Authentication required.' }, 401);
    }

    const roomId = c.req.param('roomId');
    if (!roomId) {
      return c.json({ error: 'Invalid input', message: 'Room ID is required for WebSocket connection.' }, 400);
    }

    // Validate if the room exists (optional, DO can handle non-existent IDs gracefully or create on demand)
    // const db = getCanvasD1DB(c.env.DB);
    // const roomExists = await dbGetCanvasRoomById(db, roomId);
    // if (!roomExists) {
    //   return c.json({ error: 'Not found', message: 'Room not found.' }, 404);
    // }

    try {
      const stub = getCanvasRoomStub(c.env, roomId);
      
      // Forward the request to the Durable Object, appending necessary info like userId for the DO to use
      // The DO's fetch method will handle the WebSocket upgrade.
      // Pass userId and potentially a client-generated ID for reconnection purposes.
      const clientId = c.req.query('clientId') || crypto.randomUUID(); // Client can send its ID for session resumption
      const forwardUrl = new URL(c.req.url); // Base URL from incoming request
      forwardUrl.pathname = '/websocket'; // Path DO expects for WS upgrade
      forwardUrl.searchParams.set('userId', user.id);
      forwardUrl.searchParams.set('clientId', clientId);
      
      // Create a new request to forward, preserving original headers relevant for WebSocket upgrade
      const forwardedRequest = new Request(forwardUrl.toString(), {
        headers: c.req.raw.headers, // Pass original headers
        method: c.req.method, // Should be GET
      });

      return await stub.fetch(forwardedRequest);
    } catch (error: any) {
      console.error(`Error establishing WebSocket connection for room ${roomId}:`, error);
      // The error might be from the DO itself if it throws before upgrading.
      // Typically, if stub.fetch fails before upgrade, it might return a Response object.
      if (error instanceof Response) {
        return error;
      }
      return c.json({ error: 'WebSocket connection failed', message: error.message || 'Internal server error' }, 500);
    }
  }); 