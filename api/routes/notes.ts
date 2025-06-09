import { Hono } from 'hono';
import { getUserNotesDatabaseStub } from '../lib/durableObjects';

// Define environment type matching api/index.ts
type Env = {
  USER_NOTES_DATABASE: DurableObjectNamespace;
  DB: any; // D1 database for auth
  [key: string]: any;
};

// Define user type
interface User {
  id: string;
  [key: string]: any;
}

// Define Hono variables
interface Variables {
  user: User;
}

// Create Hono app with proper types
export const notesRouter = new Hono<{ Bindings: Env, Variables: Variables }>()
  .use('*', async (c, next) => {
    // First check if user is already set from cookie auth
    let user = c.get('user') as User | null;
    
    if (!user) {
      // If no user in context, try to get it from the Authorization header
      const authHeader = c.req.header('Authorization');
      
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        
        try {
          // Find session by token
          const sessionResult = await c.env.DB.prepare(
            "SELECT * FROM session WHERE token = ?"
          ).bind(token).first();
          
          if (sessionResult) {
            // Get user from session
            const userResult = await c.env.DB.prepare(
              "SELECT * FROM user WHERE id = ?"
            ).bind(sessionResult.user_id).first();
            
            if (userResult) {
              // Set the user so it's available in the next handlers
              user = userResult;
              c.set('user', userResult);
            }
          }
        } catch (error) {
          console.error('Error validating token:', error);
        }
      }
    }
    
    // Check if we have a valid user from either cookie or token auth
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401 as const);
    }
    
    await next();
  })

  // Get all notes for authenticated user
  .get('/', async (c) => {
    const user = c.get('user');
    const stub = getUserNotesDatabaseStub(c.env, user.id);
    
    try {
      const response = await stub.fetch(new Request('https://do-dummy/notes', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      }));
      
      if (!response.ok) {
        const error = await response.json() as Record<string, any>;
        return c.json(error, response.status as any);
      }
      
      return response;
    } catch (error) {
      console.error('Error fetching notes:', error);
      return c.json({ error: 'Failed to fetch notes' }, 500 as const);
    }
  })

  // Create new note
  .post('/', async (c) => {
    const user = c.get('user');
    const stub = getUserNotesDatabaseStub(c.env, user.id);
    
    try {
      const body = await c.req.json();
      
      const response = await stub.fetch(new Request('https://do-dummy/notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body)
      }));
      
      if (!response.ok) {
        const error = await response.json() as Record<string, any>;
        return c.json(error, response.status as any);
      }
      
      return response;
    } catch (error) {
      console.error('Error creating note:', error);
      return c.json({ error: 'Failed to create note' }, 500 as const);
    }
  })

  // Update note
  .put('/:noteId', async (c) => {
    const user = c.get('user');
    const noteId = c.req.param('noteId');
    const stub = getUserNotesDatabaseStub(c.env, user.id);
    
    try {
      const body = await c.req.json();
      
      const response = await stub.fetch(new Request(`https://do-dummy/notes/${noteId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body)
      }));
      
      if (!response.ok) {
        const error = await response.json() as Record<string, any>;
        return c.json(error, response.status as any);
      }
      
      return response;
    } catch (error) {
      console.error('Error updating note:', error);
      return c.json({ error: 'Failed to update note' }, 500 as const);
    }
  })

  // Update note (PATCH version for partial updates)
  .patch('/:noteId', async (c) => {
    const user = c.get('user');
    const noteId = c.req.param('noteId');
    const stub = getUserNotesDatabaseStub(c.env, user.id);
    
    try {
      const body = await c.req.json();
      
      const response = await stub.fetch(new Request(`https://do-dummy/notes/${noteId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body)
      }));
      
      if (!response.ok) {
        const error = await response.json() as Record<string, any>;
        return c.json(error, response.status as any);
      }
      
      return response;
    } catch (error) {
      console.error('Error updating note:', error);
      return c.json({ error: 'Failed to update note' }, 500 as const);
    }
  })

  // Delete note
  .delete('/:noteId', async (c) => {
    const user = c.get('user');
    const noteId = c.req.param('noteId');
    const stub = getUserNotesDatabaseStub(c.env, user.id);
    
    try {
      const response = await stub.fetch(new Request(`https://do-dummy/notes/${noteId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        }
      }));
      
      if (!response.ok) {
        const error = await response.json() as Record<string, any>;
        return c.json(error, response.status as any);
      }
      
      return response;
    } catch (error) {
      console.error('Error deleting note:', error);
      return c.json({ error: 'Failed to delete note' }, 500 as const);
    }
  });

// WebSocket endpoint for real-time updates
export const notesWebSocketRouter = new Hono<{ Bindings: Env, Variables: Variables }>()
  .use('*', async (c, next) => {
    // First check if user is already set from cookie auth
    let user = c.get('user') as User | null;
    
    if (!user) {
      // If no user in context, try to get it from the Authorization header or query param
      const authHeader = c.req.header('Authorization');
      const tokenParam = new URL(c.req.url).searchParams.get('token');
      
      // First try Authorization header
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        user = await getUserFromToken(c, token);
      } 
      // Then try query parameter token (useful for WebSocket connections)
      else if (tokenParam) {
        user = await getUserFromToken(c, tokenParam);
      }
      
      // Set the user if we found one
      if (user) {
        c.set('user', user);
      }
    }
    
    // Check if we have a valid user from either cookie or token auth
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401 as const);
    }
    
    await next();
  })
  .get('/ws', async (c) => {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401 as const);
    }
    
    const stub = getUserNotesDatabaseStub(c.env, user.id);
    
    try {
      const response = await stub.fetch(new Request('https://do-dummy/websocket', {
        headers: {
          'Upgrade': 'websocket',
        }
      }));
      
      return response;
    } catch (error) {
      console.error('Error establishing WebSocket connection:', error);
      return c.json({ error: 'Failed to establish WebSocket connection' }, 500 as const);
    }
  });

// Helper function to get user from token
async function getUserFromToken(c: any, token: string): Promise<User | null> {
  try {
    // Find session by token
    const sessionResult = await c.env.DB.prepare(
      "SELECT * FROM session WHERE token = ?"
    ).bind(token).first();
    
    if (!sessionResult) {
      return null;
    }
    
    // Get user from session
    const userResult = await c.env.DB.prepare(
      "SELECT * FROM user WHERE id = ?"
    ).bind(sessionResult.user_id).first();
    
    if (!userResult) {
      return null;
    }
    
    return userResult as User;
  } catch (error) {
    console.error('Error validating token:', error);
    return null;
  }
} 