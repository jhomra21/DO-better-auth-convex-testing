import { Hono, type Context } from 'hono'
import { cors } from 'hono/cors'
import { createAuth } from './lib/auth';
import type { D1Database, KVNamespace } from '@cloudflare/workers-types';
import protectedRoutes from './routes/protected';
import { getFrontendUrl, getSignInErrorUrl } from './lib/config';
import { notesRouter, notesWebSocketRouter } from './routes/notes';
import { UserNotesDatabase } from './durable-objects/UserNotesDatabase';

// Import Canvas related modules
import { CanvasRoom } from './durable-objects/CanvasRoom';
import { canvasRouter } from './routes/canvas';
import { canvasWebSocketRouter } from './routes/canvas-ws';

// Define the environment type for Hono
type Env = {
    DB: D1Database; 
    SESSIONS_KV: KVNamespace;
    BETTER_AUTH_SECRET: string;
    BETTER_AUTH_URL: string;
    GOOGLE_CLIENT_SECRET: string;
    GOOGLE_CLIENT_ID: string;
    NODE_ENV?: string; // Add NODE_ENV as an optional string property
    USER_NOTES_DATABASE: DurableObjectNamespace;
    CANVAS_ROOM: DurableObjectNamespace; // Added for CanvasRoom DO
    // Add other bindings/variables like GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET if using social providers
    // GITHUB_CLIENT_ID?: string;
    // GITHUB_CLIENT_SECRET?: string;
};

// Define Variables for Hono context
type HonoVariables = {
    auth: ReturnType<typeof createAuth>; // Use ReturnType to get the instance type
    user: any; // Or a more specific user type from BetterAuth
    session: any; // Or a more specific session type from BetterAuth
}

const app = new Hono<{ Bindings: Env, Variables: HonoVariables }>()

// CORS Configuration with enhanced header handling
app.use('*', cors({
  origin: (origin) => {
    const allowedOrigins = [
        'http://localhost:3000', 
        'http://localhost:4173', 
        'http://localhost:5173', 
        'http://127.0.0.1:5173',
        'http://127.0.0.1:3000',
        'https://convex-better-auth-testing.pages.dev',
        'https://better-auth-api-cross-origin.jhonra121.workers.dev'
    ];
    if (!origin || allowedOrigins.includes(origin)) {
        return origin || '*';
    }
    return null; 
  },
  allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Cache-Control', 'Pragma', 'set-auth-token', 'Set-Auth-Token'],
  allowMethods: ['POST', 'GET', 'OPTIONS', 'PUT', 'DELETE', 'HEAD', 'PATCH'],
  exposeHeaders: ['Content-Length', 'Set-Cookie', 'set-auth-token', 'Set-Auth-Token'], 
  maxAge: 86400,
  credentials: true, 
}));

// Initialize Better Auth middleware
app.use('*', async (c, next) => {
  const auth = createAuth(c.env);
  c.set('auth', auth);

  let user: any = null;
  let session: any = null;

  try {
    // getSession will check for session cookie and Authorization header,
    // and validate against the KV store via secondaryStorage config.
    const sessionData = await auth.api.getSession({ headers: c.req.raw.headers });
    if (sessionData && sessionData.user) {
      user = sessionData.user;
      session = sessionData.session;
    } 
  } catch (error) {
    console.error('[AUTH_MIDDLEWARE] Error in auth.api.getSession:', error);
  }

  c.set('user', user);
  c.set('session', session);
  
  await next();
});

// Mount Better Auth handler for all auth routes
app.on(['POST', 'GET', 'OPTIONS'], '/api/auth/*', async (c) => {
  const auth = c.get('auth');
  
  // Get frontend URL from config helper
  const frontendUrl = getFrontendUrl(c.env);
    
    try {
    // Apply special headers for CORS
    const headers = new Headers();
    headers.append('Access-Control-Allow-Origin', c.req.header('Origin') || frontendUrl);
    headers.append('Access-Control-Allow-Credentials', 'true');
    headers.append('Access-Control-Expose-Headers', 'Content-Length, Set-Cookie, set-auth-token, Set-Auth-Token');
    
    // Use our wrapped handler that handles empty JSON bodies
    const response = await auth.handler(c.req.raw);
    
    // Copy the headers from the auth response to our headers
    response.headers.forEach((value, key) => {
      headers.append(key, value);
    });
    
    // Special handling for OAuth callbacks - check if it's a redirect response
    const url = new URL(c.req.url);
    const isOAuthCallback = url.pathname.includes('/callback/');
    
    if (isOAuthCallback && response.status >= 300 && response.status < 400) {
      // Get the location header for redirect
      
      try {
        // Extract the token from the response or find it in the DB
        const authToken = response.headers.get('set-auth-token') || 
                          response.headers.get('Set-Auth-Token');
        
        // Get frontend URL from config helper
        const actualFrontendUrl = getFrontendUrl(c.env);
        
        if (authToken) {
          headers.set('location', `${actualFrontendUrl}/?token=${encodeURIComponent(authToken)}`);
        } else {
          // If token not in headers, need to find the most recently created session
          // This is necessary because Better Auth doesn't always expose the token in headers
          
          try {
            // Get the most recently created session from the database
            const sessionsResult = await c.env.DB.prepare(
              "SELECT * FROM session ORDER BY created_at DESC LIMIT 1"
            ).all();
            
            if (sessionsResult.results && sessionsResult.results.length > 0) {
              const sessionRow = sessionsResult.results[0];
              const dbToken = sessionRow.token;
              
              // Ensure the token is a string
              if (typeof dbToken === 'string') {
                headers.set('location', `${actualFrontendUrl}/?token=${encodeURIComponent(dbToken)}`);
              } else {
                headers.set('location', actualFrontendUrl);
              }
            } else {
              headers.set('location', actualFrontendUrl);
            }
          } catch (dbError) {
            headers.set('location', actualFrontendUrl);
          }
        }
      } catch (error) {
        console.error('Error handling OAuth callback:', error);
        const errorRedirect = getSignInErrorUrl(c.env);
        headers.set('location', errorRedirect);
      }
    }
    
    // Create a new response with our headers
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: headers
    });
  } catch (error) {
    console.error('Auth error:', error);
    return c.json({ error: 'Authentication error' }, 500);
  }
});


// Root endpoint
app.get('/', (c: Context<{ Bindings: Env }>) => {
  return c.text('Hello from Hono API!');
});

// Add a session endpoint to check auth status
app.get('/session', async (c) => {
  const user = c.get('user');
  const session = c.get('session');
  
  // Debug logging
  console.log('[SESSION_ENDPOINT] User in context:', user?.id);
  console.log('[SESSION_ENDPOINT] Session in context:', session?.id);
  
  // The global middleware has already done the work of validating the session
  // from cookie or token and setting the context. We just return it.
  if (user) {
    return c.json({
      authenticated: true,
      user,
      session
    });
  }
  
  // No valid authentication found by the global middleware
  return c.json({
    authenticated: false
  });
});

// Mount protected routes under /api/protected
app.route('/api/protected', protectedRoutes);

// Add notes routes
app.route('/api/notes', notesRouter);
// WebSocket should be under a different path to avoid conflict
app.route('/api/notes-ws', notesWebSocketRouter);

// Add Canvas routes
app.route('/api/canvas', canvasRouter);
app.route('/api/canvas-ws', canvasWebSocketRouter);

// Export Durable Object classes
export { UserNotesDatabase, CanvasRoom };

export default app;