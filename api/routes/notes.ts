import { Hono } from 'hono';
import { getUserNotesDatabaseStub } from '../lib/durableObjects';

// Define environment type matching api/index.ts
type Env = {
  USER_NOTES_DATABASE: DurableObjectNamespace;
  DB: any; // D1 database for auth
  CANVAS_ROOM: DurableObjectNamespace;
  SESSIONS_KV: KVNamespace;
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
    const user = c.get('user') as User | null;
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
    let user = c.get('user') as User | null;
    
    if (!user) {
      const authHeader = c.req.header('Authorization');
      const url = new URL(c.req.url);
      const tokenParam = url.searchParams.get('token');
      let token: string | null = null;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      } else if (tokenParam) {
        token = tokenParam;
      } 

      if (token) {
        try {
            const sessionValue = await c.env.SESSIONS_KV.get(token);
            if(sessionValue) {
                const sessionData = JSON.parse(sessionValue);
                if (sessionData.session && sessionData.user && new Date(sessionData.session.expires_at).getTime() > Date.now()) {
                    user = sessionData.user;
      if (user) {
        c.set('user', user);
      }
    }
            }
        } catch (e) {
            console.error("Error validating token from KV for WebSocket:", e);
        }
      }
    }
    
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