import { Hono, type Context } from 'hono'
import { cors } from 'hono/cors'
import { createAuth } from './lib/auth';
import type { D1Database } from '@cloudflare/workers-types';
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
    // Define the allowed origins
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:4173',
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:3000',
      'https://convex-better-auth-testing.pages.dev',
    ];

    // Allow requests from the defined origins
    if (allowedOrigins.includes(origin)) {
      return origin;
    }
    
    // For local development, you might also want to handle cases where the origin is not set
    // This is not recommended for production but can be useful for debugging.
    if (!origin && process.env.NODE_ENV === 'development') {
      return '*';
    }

    // Block all other origins
    return null;
  },
  allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Cache-Control', 'Pragma', 'Set-Cookie'],
  allowMethods: ['POST', 'GET', 'OPTIONS', 'PUT', 'DELETE', 'HEAD', 'PATCH'],
  exposeHeaders: ['Content-Length', 'Set-Cookie'],
  maxAge: 86400,
  credentials: true,
}));

// This middleware is modeled directly on the Better Auth documentation.
// It initializes auth and sets the user/session in the context for all routes.
app.use("*", async (c, next) => {
  const auth = createAuth(c.env);
  c.set("auth", auth);

  // Get session and set user/session context.
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (session) {
      c.set("user", session.user);
      c.set("session", session.session);
    } else {
      c.set("user", null);
      c.set("session", null);
    }
  } catch {
    c.set("user", null);
    c.set("session", null);
  }
  
  await next();
});

// This route is modeled directly on the Better Auth documentation.
// It delegates all /api/auth/* requests to the auth handler.
app.on(["POST", "GET", "OPTIONS"], "/api/auth/*", (c) => {
  const auth = c.get('auth');
  return auth.handler(c.req.raw);
});

// Root endpoint
app.get('/', (c: Context<{ Bindings: Env }>) => {
  return c.text('Hello from Hono API!');
});

// Add a session endpoint to check auth status
app.get('/session', async (c) => {
  const user = c.get('user');
  const session = c.get('session');

  // The global middleware populates 'user' and 'session' if the cookie is valid.
  if (user) {
    return c.json({
      authenticated: true,
      user,
      session,
    });
  }

  // If no user is found in the context, they are not authenticated.
  return c.json({
    authenticated: false,
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