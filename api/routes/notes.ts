import { Hono } from 'hono';
import { getUserNotesDatabaseStub } from '../lib/durableObjects';
import { authMiddleware } from '../lib/authMiddleware';

// Define environment type matching api/index.ts
type Env = {
  USER_NOTES_DATABASE: DurableObjectNamespace;
  CANVAS_ROOM: DurableObjectNamespace;
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
  session?: any;
  auth: any;
}

// Create Hono app with proper types
export const notesRouter = new Hono<{ Bindings: Env, Variables: Variables }>()
  .use('*', authMiddleware)

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
    let user = c.get('user') as User | null;

    if (!user) {
      // For WebSockets, token can be in Authorization header (less common) or query param
      const auth = c.get('auth'); // from global middleware
      const token = c.req.header('Authorization')?.split(' ')[1] ?? c.req.query('token');

      if (token && auth) {
        // We create a new pseudo-request with an Authorization header to validate the token
        const pseudoRequest = new Request(c.req.url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        // Use the auth instance from context to validate
        const sessionData = await auth.api.getSession({ headers: pseudoRequest.headers });

        if (sessionData?.user) {
            user = sessionData.user as User;
            c.set('user', user);
            c.set('session', sessionData.session);
        }
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