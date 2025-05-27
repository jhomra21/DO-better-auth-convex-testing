import type { MiddlewareHandler } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';

/**
 * Middleware to protect routes that require authentication
 * This middleware checks if the user is authenticated and returns a 401 if not
 * It now properly handles both cookie-based auth and JWT token auth
 */
export const authMiddleware: MiddlewareHandler = async (c, next) => {
  // Check if we already have a user from the global middleware
  const user = c.get('user');
  
  if (user) {
    // If we have a user from the cookie or session, proceed
    await next();
    return;
  }
  
  // Otherwise, check for token-based authentication
  const authHeader = c.req.header('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    
    try {
      // Find session by token
      const sessionResult = await c.env.DB.prepare(
        "SELECT * FROM session WHERE token = ?"
      ).bind(token).first();
      
      if (!sessionResult) {
        return c.json({ 
          error: 'Unauthorized', 
          message: 'Invalid token' 
        }, 401);
      }
      
      // Get user from session
      const userResult = await c.env.DB.prepare(
        "SELECT * FROM user WHERE id = ?"
      ).bind(sessionResult.user_id).first();
      
      if (!userResult) {
        return c.json({ 
          error: 'Unauthorized', 
          message: 'User not found' 
        }, 401);
      }
      
      // Set the user and session in the context for the duration of this request
      c.set('user', userResult);
      c.set('session', sessionResult);
      
      // Proceed to the route handler
      await next();
      return;
    } catch (error) {
      console.error('Error validating token:', error);
      return c.json({ 
        error: 'Unauthorized', 
        message: 'Error validating token' 
      }, 401);
    }
  }
  
  // If we get here, no valid authentication was found
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