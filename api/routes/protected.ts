import { Hono } from 'hono';
import { authMiddleware, roleMiddleware } from '../lib/authMiddleware';
import type { D1Database, KVNamespace } from '@cloudflare/workers-types';

// Define environment type for protected routes
type Env = {
  DB: D1Database;
  SESSIONS_KV: KVNamespace;
  // Add other environment variables as needed
};

// Define variables for Hono context
type HonoVariables = {
  user: any; // User from Better Auth
  session: any; // Session from Better Auth
  auth: any; // Better Auth instance
};

// Create a Hono app for protected routes
const protectedRoutes = new Hono<{ Bindings: Env, Variables: HonoVariables }>();

// Apply auth middleware to all routes in this group
protectedRoutes.use('*', authMiddleware);

// Basic user profile endpoint
protectedRoutes.get('/profile', async (c) => {
  const user = c.get('user');
  
  return c.json({
    success: true,
    profile: {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      image: user.image,
      createdAt: user.createdAt
    }
  });
});

// Update user profile endpoint
protectedRoutes.put('/profile', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  
  // Only allow updating certain fields
  const allowedFields = ['name', 'image'];
  const updates: Record<string, any> = {};
  
  // Filter out only allowed fields
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }
  
  if (Object.keys(updates).length === 0) {
    return c.json({
      success: false,
      message: 'No valid fields to update'
    }, 400);
  }
  
  try {
    // Update user in database
    // This assumes you're using the user table from Better Auth
    const updateFields = Object.entries(updates)
      .map(([key, value]) => `${key} = ?`)
      .join(', ');
    
    const updateValues = Object.values(updates);
    
    await c.env.DB.prepare(
      `UPDATE user SET ${updateFields}, updated_at = ? WHERE id = ?`
    )
    .bind(...updateValues, Date.now(), user.id)
    .run();
    
    return c.json({
      success: true,
      message: 'Profile updated successfully',
      updates
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    return c.json({
      success: false,
      message: 'Failed to update profile'
    }, 500);
  }
});

// Example of a role-protected endpoint
// This endpoint requires the 'admin' role
protectedRoutes.get('/admin/users', roleMiddleware(['admin']), async (c) => {
  try {
    const users = await c.env.DB.prepare(
      'SELECT id, name, email, email_verified, image, created_at FROM user'
    ).all();
    
    return c.json({
      success: true,
      users: users.results
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    return c.json({
      success: false,
      message: 'Failed to fetch users'
    }, 500);
  }
});

// Endpoint to get user's sessions from KV
protectedRoutes.get('/sessions', async (c) => {
  const user = c.get('user');
  if (!user?.id) {
    return c.json({ success: false, message: 'User not authenticated' }, 401);
  }

  try {
    const listResult = await c.env.SESSIONS_KV.list({ prefix: `user:${user.id}:session:` });

    const sessionPromises = listResult.keys.map(async (key: { name: string }) => {
      const token = await c.env.SESSIONS_KV.get(key.name);
      if (!token) return null;
      const sessionDataString = await c.env.SESSIONS_KV.get(token);
      if (!sessionDataString) return null;
      // We can parse and return the full session object
      return JSON.parse(sessionDataString);
    });

    const sessions = (await Promise.all(sessionPromises)).filter(Boolean);

    return c.json({
      success: true,
      sessions: sessions
    });

  } catch (error) {
    console.error('Failed to fetch sessions from KV:', error);
    return c.json({
      success: false,
      message: 'Failed to fetch sessions'
    }, 500);
  }
});

// Endpoint to revoke a specific session from KV
protectedRoutes.delete('/sessions/:sessionId', async (c) => {
    const user = c.get('user');
    const { sessionId } = c.req.param();
    const currentSession = c.get('session');

    if (!user?.id) {
        return c.json({ success: false, message: 'User not authenticated' }, 401);
    }
    
    // Better Auth session object is nested. Let's get the actual session id.
    const currentSessionId = currentSession?.session?.id;

    // Prevent revoking the current session via this endpoint.
    // The user should use the main sign-out button for that.
    if (sessionId === currentSessionId) {
        return c.json({
            success: false,
            message: 'Cannot revoke the current session. Please use the main sign-out button.'
        }, 400);
    }

    try {
        const userSessionKey = `user:${user.id}:session:${sessionId}`;
        
        // Get the token associated with the session ID
        const token = await c.env.SESSIONS_KV.get(userSessionKey);

        if (!token) {
            return c.json({
                success: false,
                message: 'Session not found or you do not have permission to revoke it.'
            }, 404);
        }

        // Delete the user-to-session mapping
        await c.env.SESSIONS_KV.delete(userSessionKey);
        // Delete the main session entry using the token
        await c.env.SESSIONS_KV.delete(token);

        return c.json({
            success: true,
            message: 'Session revoked successfully'
        });

    } catch (error) {
        console.error('Failed to revoke session from KV:', error);
        return c.json({
            success: false,
            message: 'Failed to revoke session'
        }, 500);
    }
});

export default protectedRoutes; 