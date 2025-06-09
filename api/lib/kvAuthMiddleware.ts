import { KVSessionManager, extractToken } from './kvSessions';

interface KVAuthEnv {
  SESSIONS_KV: KVNamespace;
  DB: any; // D1 database
}

interface User {
  id: string;
  email: string;
  name: string;
  [key: string]: any;
}

interface Variables {
  user: User;
  sessionData: any;
}

export async function kvAuthMiddleware(
  c: { 
    env: KVAuthEnv; 
    req: { header: (name: string) => string | undefined }; 
    get: (key: string) => any;
    set: (key: string, value: any) => void;
    json: (data: any, status?: number) => Response;
  }, 
  next: () => Promise<void>
) {
  const sessionManager = new KVSessionManager(c.env.SESSIONS_KV);
  
  // Extract token from request
  const token = extractToken(new Request('https://dummy', {
    headers: {
      'Authorization': c.req.header('Authorization') || '',
      'Cookie': c.req.header('Cookie') || ''
    }
  }));
  
  if (!token) {
    return c.json({ error: 'Unauthorized - No token provided' }, 401);
  }

  try {
    console.log('Validating session with KV...');
    const startTime = Date.now();
    
    // Fast KV session lookup (~1ms vs ~50ms D1 query)
    const sessionData = await sessionManager.validateSession(token);
    
    const kvLatency = Date.now() - startTime;
    console.log(`KV session lookup: ${kvLatency}ms`);
    
    if (!sessionData) {
      return c.json({ error: 'Invalid or expired session' }, 401);
    }

    // Optional: Get fresh user data from D1 (cached by Cloudflare)
    // For most requests, the session data is sufficient
    let user: User;
    
    // Use session data first (faster), fall back to D1 if needed
    if (sessionData.userEmail && sessionData.userName) {
      user = {
        id: sessionData.userId,
        email: sessionData.userEmail,
        name: sessionData.userName
      };
    } else {
      // Fallback to D1 query if session data is incomplete
      const dbStartTime = Date.now();
      const userResult = await c.env.DB.prepare(
        "SELECT * FROM user WHERE id = ?"
      ).bind(sessionData.userId).first();
      
      const dbLatency = Date.now() - dbStartTime;
      console.log(`D1 user lookup: ${dbLatency}ms`);

      if (!userResult) {
        // User was deleted, clean up the session
        await sessionManager.deleteSession(token);
        return c.json({ error: 'User not found' }, 401);
      }
      
      user = userResult as User;
    }

    // Set user and session data in context
    c.set('user', user);
    c.set('sessionData', sessionData);
    
    console.log(`Auth completed for user ${user.id} (${user.email})`);
    
    await next();
  } catch (error) {
    console.error('KV Auth middleware error:', error);
    return c.json({ error: 'Authentication failed' }, 500);
  }
}

// Alternative: Auth middleware that only validates without user lookup
export async function fastAuthMiddleware(
  c: { 
    env: KVAuthEnv; 
    req: { header: (name: string) => string | undefined }; 
    set: (key: string, value: any) => void;
    json: (data: any, status?: number) => Response;
  }, 
  next: () => Promise<void>
) {
  const sessionManager = new KVSessionManager(c.env.SESSIONS_KV);
  
  const token = extractToken(new Request('https://dummy', {
    headers: {
      'Authorization': c.req.header('Authorization') || '',
      'Cookie': c.req.header('Cookie') || ''
    }
  }));
  
  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const sessionData = await sessionManager.validateSession(token);
    
    if (!sessionData) {
      return c.json({ error: 'Invalid session' }, 401);
    }

    // Set minimal user data from session (no D1 query needed)
    c.set('user', {
      id: sessionData.userId,
      email: sessionData.userEmail,
      name: sessionData.userName
    });
    c.set('sessionData', sessionData);
    
    await next();
  } catch (error) {
    console.error('Fast auth middleware error:', error);
    return c.json({ error: 'Authentication failed' }, 500);
  }
}

// Session management endpoints
export function createSessionRoutes() {
  return {
    // Extend current session
    extendSession: async (c: any) => {
      const sessionManager = new KVSessionManager(c.env.SESSIONS_KV);
      const token = extractToken(c.req.raw);
      
      if (!token) {
        return c.json({ error: 'No session token' }, 400);
      }
      
      const newExpiration = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
      const success = await sessionManager.extendSession(token, newExpiration);
      
      if (success) {
        return c.json({ 
          message: 'Session extended', 
          expiresAt: newExpiration.toISOString() 
        });
      } else {
        return c.json({ error: 'Session not found' }, 404);
      }
    },

    // Logout current session
    logoutSession: async (c: any) => {
      const sessionManager = new KVSessionManager(c.env.SESSIONS_KV);
      const token = extractToken(c.req.raw);
      
      if (token) {
        await sessionManager.deleteSession(token);
      }
      
      return c.json({ message: 'Logged out successfully' });
    },

    // Logout all user sessions
    logoutAllSessions: async (c: any) => {
      const user = c.get('user');
      const sessionManager = new KVSessionManager(c.env.SESSIONS_KV);
      
      await sessionManager.logoutAllUserSessions(user.id);
      
      return c.json({ message: 'All sessions terminated' });
    },

    // Get session info
    getSessionInfo: async (c: any) => {
      const sessionData = c.get('sessionData');
      
      return c.json({
        userId: sessionData.userId,
        createdAt: new Date(sessionData.createdAt).toISOString(),
        expiresAt: new Date(sessionData.expiresAt).toISOString(),
        ipAddress: sessionData.ipAddress,
        userAgent: sessionData.userAgent
      });
    }
  };
}
