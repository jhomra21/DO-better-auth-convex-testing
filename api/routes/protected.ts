import { Hono } from 'hono';
import { authMiddleware, roleMiddleware } from '../lib/authMiddleware';
import type { D1Database } from '@cloudflare/workers-types';

// Define environment type for protected routes
type Env = {
  DB: D1Database;
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

// Endpoint to get user's sessions
protectedRoutes.get('/sessions', async (c) => {
  const user = c.get('user');  
  
  try {
    const sessions = await c.env.DB.prepare(
      `SELECT * FROM session WHERE user_id = ?`
    ).bind(user.id).all();
    
    return c.json({
      success: true,
      sessions: sessions.results
    });
  } catch (error) {
    return c.json({
      success: false,
      message: 'Failed to fetch sessions'
    }, 500);
  }
});

// Debug endpoint to check token validation
protectedRoutes.get('/debug-token', async (c) => {
  const user = c.get('user');
  const session = c.get('session');
  const authHeader = c.req.header('Authorization');
  
  // Check token directly from the database if provided in header
  let dbLookupResult = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const dbSession = await c.env.DB.prepare(
        "SELECT * FROM session WHERE token = ?"
      ).bind(token).first();
      
      if (dbSession) {
        dbLookupResult = {
          found: true,
          session_id: dbSession.id,
          user_id: dbSession.user_id,
          expires_at: dbSession.expires_at
        };
      } else {
        dbLookupResult = { found: false, message: 'Token not found in database' };
      }
    } catch (error) {
      dbLookupResult = { found: false, error: String(error) };
    }
  }
  
  return c.json({
    success: true,
    middleware: {
      hasUser: !!user,
      hasSession: !!session,
      user: user ? { id: user.id, email: user.email } : null,
      session: session ? { id: session.id, expires_at: session.expires_at } : null
    },
    auth_header: authHeader,
    db_lookup: dbLookupResult
  });
});

export default protectedRoutes; 