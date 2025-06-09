import type { MiddlewareHandler } from 'hono';
import { createAuth } from '../lib/auth';
import type { D1Database, KVNamespace } from '@cloudflare/workers-types';

type Env = {
	DB: D1Database;
	SESSIONS_KV: KVNamespace;
	BETTER_AUTH_SECRET: string;
	BETTER_AUTH_URL: string;
	GOOGLE_CLIENT_SECRET: string;
	GOOGLE_CLIENT_ID: string;
	NODE_ENV?: string;
};

type HonoContext = {
  Variables: {
    user: any;
    session: any;
  },
  Bindings: Env
}

/**
 * Middleware to protect routes that require authentication.
 * This middleware relies on the global middleware in `api/index.ts` to have
 * already authenticated the user and set the `user` object in the context.
 * This simply checks for the presence of the user and returns 401 if not found.
 */
export const authMiddleware: MiddlewareHandler<HonoContext> = async (c, next) => {
  const user = c.get('user');
  
  if (!user) {
    return c.json({ 
      error: 'Unauthorized', 
      message: 'Authentication required' 
    }, 401);
  }
  
  await next();
};

/**
 * Middleware to check for specific roles or permissions
 * @param roles Array of role names required to access the route
 */
export const roleMiddleware = (roles: string[]): MiddlewareHandler<HonoContext> => {
  return async (c, next) => {
    // Check if we already have a user from the auth middleware
    const user = c.get('user');
    
    if (!user) {
      // This should not happen if roleMiddleware is used after authMiddleware,
      // but we check just to be safe
      return c.json({ 
        error: 'Unauthorized', 
        message: 'Authentication required' 
      }, 401);
    }
    
    // Check if user has any of the required roles
    // This assumes your user object has a roles array
    // Adjust according to your actual user structure
    const userRoles = user.roles || [];
    const hasRequiredRole = roles.some(role => userRoles.includes(role));
    
    if (!hasRequiredRole) {
      return c.json({ 
        error: 'Forbidden', 
        message: 'Insufficient permissions' 
      }, 403);
    }
    
    await next();
  };
}; 