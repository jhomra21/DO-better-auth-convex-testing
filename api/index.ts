import { Hono, type Context } from 'hono'
import { cors } from 'hono/cors'
import { drizzle } from 'drizzle-orm/d1';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { createAuth } from './lib/auth';
import { createAuthTables, getDB } from './lib/db';
import type { D1Database } from '@cloudflare/workers-types';

// Define the environment type for Hono
type Env = {
    DB: D1Database; 
    BETTER_AUTH_SECRET: string;
    BETTER_AUTH_URL: string;
    GOOGLE_CLIENT_SECRET: string;
    GOOGLE_CLIENT_ID: string;
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
  // Create auth instance
  const auth = createAuth(c.env);
  c.set('auth', auth);
  
  // Get session and set user context
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (session) {
      c.set('user', session.user);
      c.set('session', session.session);
    } else {
      c.set('user', null);
      c.set('session', null);
    }
  } catch (error) {
    console.error('Error getting session:', error);
    c.set('user', null);
    c.set('session', null);
  }
  
  await next();
});

// Mount Better Auth handler for all auth routes
app.on(['POST', 'GET', 'OPTIONS'], '/api/auth/*', async (c) => {
  const auth = c.get('auth');
  
  // Hard-code the frontend URL for production
  const frontendUrl = 'https://convex-better-auth-testing.pages.dev';
    
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
      const location = response.headers.get('location');
      console.log('OAuth callback redirect to:', location);
      
      try {
        // Extract the token from the response or find it in the DB
        const authToken = response.headers.get('set-auth-token') || 
                          response.headers.get('Set-Auth-Token');
        
        // Always use the production frontend URL
        const actualFrontendUrl = 'https://convex-better-auth-testing.pages.dev';
        
        if (authToken) {
          console.log('Found auth token in response headers, using it for redirect');
          headers.set('location', `${actualFrontendUrl}/?token=${encodeURIComponent(authToken)}`);
        } else {
          // If token not in headers, need to find the most recently created session
          // This is necessary because Better Auth doesn't always expose the token in headers
          console.log('No auth token in headers, searching in database');
          
          try {
            // Get the most recently created session from the database
            const sessionsResult = await c.env.DB.prepare(
              "SELECT * FROM session ORDER BY created_at DESC LIMIT 1"
            ).all();
            
            if (sessionsResult.results && sessionsResult.results.length > 0) {
              const sessionRow = sessionsResult.results[0];
              const dbToken = sessionRow.token;
              
              console.log('Found token in database:', dbToken);
              // Ensure the token is a string
              if (typeof dbToken === 'string') {
                headers.set('location', `${actualFrontendUrl}/?token=${encodeURIComponent(dbToken)}`);
              } else {
                console.log('Token in database is not a string:', dbToken);
                headers.set('location', actualFrontendUrl);
              }
            } else {
              console.log('No session found in database, using default redirect');
              headers.set('location', actualFrontendUrl);
            }
          } catch (dbError) {
            console.error('Error querying database:', dbError);
            headers.set('location', actualFrontendUrl);
          }
        }
      } catch (error) {
        console.error('Error handling OAuth callback:', error);
        const errorRedirect = 'https://convex-better-auth-testing.pages.dev/sign-in?error=session_error';
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

// 1) Define the users table
const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
});

// Root endpoint
app.get('/', (c: Context<{ Bindings: Env }>) => {
  return c.text('Hello from Hono API!');
});

// Add a session endpoint to check auth status
app.get('/session', async (c) => {
  const user = c.get('user');
  const session = c.get('session');
  
  // Check if we have a user from context (cookie-based auth)
  if (user) {
    return c.json({
      authenticated: true,
      user,
      session
    });
  }
  
  // If no user in context, try to get it from the Authorization header
  const authHeader = c.req.header('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    
    try {
      // Direct D1 queries (not using Drizzle abstraction)
      // First get the session
      const sessionResults = await c.env.DB.prepare(
        "SELECT * FROM session WHERE token = ?"
      ).bind(token).all();
      
      if (sessionResults.results && sessionResults.results.length > 0) {
        const sessionRow = sessionResults.results[0];
        
        // Then get the user
        const userResults = await c.env.DB.prepare(
          "SELECT * FROM user WHERE id = ?"
        ).bind(sessionRow.user_id).all();
        
        if (userResults.results && userResults.results.length > 0) {
          const userRow = userResults.results[0];
          
          return c.json({
            authenticated: true,
            user: userRow,
            session: sessionRow
          });
        }
      }
    } catch (error) {
      console.error('Error getting session by token:', error);
    }
  }
  
  // If we get here, no valid session was found
  return c.json({ authenticated: false }, 401);
});

// Route to create the users table if it doesn't exist
app.get('/setup', async (c) => {
  const db = drizzle(c.env.DB);
  try {
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
      )
    `);
    return c.text('Table created or already exists!');
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Route to add a test user
app.post('/add', async (c) => {
  const db = drizzle(c.env.DB);
  try {
    // If you expect a JSON body for the user name:
    // const { name } = await c.req.json<{ name: string }>();
    // For now, let's add a hardcoded user or a user from query params
    const name = c.req.query('name') || 'Test User from /add';

    const newUser = await db.insert(users)
      .values({ name: name })
      .returning()
      .get();

    return c.json(newUser);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Route to get all users
app.get('/users', async (c) => {
  const db = drizzle(c.env.DB);
  try {
    const allUsers = await db.select().from(users).all();
    return c.json(allUsers);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Add a route to setup auth tables
app.get('/setup-auth', async (c) => {
  try {
    // Create the Drizzle DB instance
    const db = drizzle(c.env.DB);
    
    // Create auth tables based on our schema
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS user (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        email_verified INTEGER NOT NULL DEFAULT 0,
        image TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS session (
        id TEXT PRIMARY KEY,
        expires_at INTEGER NOT NULL,
        token TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
      )
    `);
    
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS account (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
        access_token TEXT,
        refresh_token TEXT,
        id_token TEXT,
        access_token_expires_at INTEGER,
        refresh_token_expires_at INTEGER,
        scope TEXT,
        password TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS verification (
        id TEXT PRIMARY KEY,
        identifier TEXT NOT NULL,
        value TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    
    return c.json({ message: 'Auth tables created successfully!', success: true });
  } catch (e: any) {
    console.error('Error creating auth tables:', e);
    return c.json({ error: e.message, success: false }, 500);
  }
});

export default app