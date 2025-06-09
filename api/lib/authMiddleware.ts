import type { MiddlewareHandler } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';

/**
 * Middleware to protect routes that require authentication.
 * This middleware now relies on the global auth middleware in `api/index.ts`
 * to have already validated the user via cookie or Bearer token (from KV).
 */
export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const user = c.get('user');
  
  if (user) {
    await next();
    return;
  }
  
  // If we get here, no valid authentication was found by the global middleware.
  return c.json({ 
    error: 'Unauthorized', 
    message: 'Authentication required' 
  }, 401);
};

/**
 * Middleware to check for specific roles or permissions
 * @param roles Array of role names required to access the route
 */
export const roleMiddleware = (roles: string[]): MiddlewareHandler => {
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