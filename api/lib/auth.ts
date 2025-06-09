import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { D1Database, KVNamespace } from '@cloudflare/workers-types';
import * as authSchema from '../../src/db/auth-schema';
import { drizzle } from 'drizzle-orm/d1';
import { getApiUrl, getFrontendUrl, getAuthCallbackUrl } from './config';

// Import Env type from the correct location
type Env = {
  DB: D1Database; 
  SESSIONS_KV: KVNamespace;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  NODE_ENV?: string; // Add NODE_ENV as an optional string property
};

// Utility function to wrap Better Auth handler with empty body handling
export function createBetterAuthHandler(auth: ReturnType<typeof betterAuth>) {
  return async (request: Request): Promise<Response> => {
    try {
      // Pass the request to the handler
      return await auth.handler(request);
    } catch (error) {
      // If the error is about JSON parsing, just continue with empty body
      if (error instanceof SyntaxError && error.message.includes('JSON')) {
        console.log('Handling empty JSON body error');
        
        // Create a new request with an empty JSON body
        const newRequest = new Request(request.url, {
          method: request.method,
          headers: request.headers,
          body: JSON.stringify({}),
        });
        
        return await auth.handler(newRequest);
      }
      
      // For other errors, rethrow
      throw error;
    }
  };
}

/**
 * IMPORTANT PERFORMANCE NOTE: 
 * Cloudflare Workers have a CPU time limit of 50ms for free tier and 30s for paid tier.
 * Password hashing is CPU-intensive, especially with default cost factors.
 * 
 * We've customized the password hashing to use a lower cost factor (8 instead of the default)
 * to prevent Workers from exceeding their CPU time limit during email/password authentication.
 * This reduces the computational cost while maintaining reasonable security.
 * 
 * If you experience 503 errors with "Worker exceeded CPU time limit" messages,
 * this optimization should help. Google Auth bypasses this issue since it doesn't 
 * require password hashing on your Worker.
 */
export const createAuth = (env: Env) => {
  // Create a drizzle instance with the D1 database
  const db = drizzle(env.DB, { schema: authSchema });
  
  // Get API and frontend URLs from config helpers
  const apiUrl = getApiUrl(env);
  const frontendURL = getFrontendUrl(env);
  const authCallbackUrl = getAuthCallbackUrl(env);
    
  const auth = betterAuth({
    projectId: 'convex-better-auth',
    secretKey: env.BETTER_AUTH_SECRET,
    baseUrl: apiUrl, // API server URL
    socialProviders: {
      google: {
        prompt: "select_account", 
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        redirectURI: authCallbackUrl
      },
    },
    redirects: {
      signIn: {
        redirect: true,
        url: frontendURL // Redirect to frontend after sign in
      },
      signUp: {
        redirect: true,
        url: frontendURL // Redirect to frontend after sign up
      },
      error: {
        redirect: true,
        url: `${frontendURL}/sign-in` // Redirect to frontend sign in page on error
      },
      callback: {
        redirect: true,
        url: frontendURL // Important: Where to redirect after OAuth callback
      },
      // Add this critical setting to ensure proper redirect after OAuth authentication
      oauth: {
        redirect: true,
        url: frontendURL // This ensures OAuth flows redirect to the frontend
      }
    },
    // Configure session management for better sign-out
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days in seconds
      updateAge: 60 * 60 * 24, // Update session every 24 hours
      strategy: "jwt", // Use JWT tokens for sessions
      storeSessionInDatabase: false, // This is crucial for using secondaryStorage for sessions
    },
    // Use drizzleAdapter with the initialized db instance
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        user: authSchema.user,
        account: authSchema.account,
        verification: authSchema.verification
      }
    }),
    // Configure KV as secondary storage for sessions.
    // This implementation adheres to Better Auth's SecondaryStorage interface.
    secondaryStorage: {
      get: async (key: string): Promise<string | null> => {
        // Must return a string or null, so we don't use the "json" type here.
        // Better Auth will handle parsing.
        return await env.SESSIONS_KV.get(key);
      },
      set: async (key: string, value: string, ttl?: number) => {
        const options = ttl ? { expirationTtl: ttl } : undefined;
        // The `value` is already a stringified JSON from Better Auth.
        await env.SESSIONS_KV.put(key, value, options);
        
        // Add user-to-session mapping for session listing
        try {
          const sessionData = JSON.parse(value) as { userId: string, id: string };
          if (sessionData.userId && sessionData.id) {
            const userSessionKey = `user:${sessionData.userId}:session:${sessionData.id}`;
            await env.SESSIONS_KV.put(userSessionKey, key, options); // Store the session token (key)
          }
        } catch (e) {
            console.error("Failed to create user-session mapping in KV", e);
        }
      },
      delete: async (key: string) => { // key is the session token
        // To delete the user-session mapping, we first need to read the session data
        const sessionValue = await env.SESSIONS_KV.get(key);
        
        // Delete the main session entry
        await env.SESSIONS_KV.delete(key);
        
        // If we found the session, delete the corresponding user-session mapping
        if (sessionValue) {
            try {
                const sessionData = JSON.parse(sessionValue) as { userId: string, id: string };
                if (sessionData.userId && sessionData.id) {
                    const userSessionKey = `user:${sessionData.userId}:session:${sessionData.id}`;
                    await env.SESSIONS_KV.delete(userSessionKey);
                }
            } catch (e) {
                console.error("Failed to delete user-session mapping from KV", e);
            }
        }
      }
    },
    emailAndPassword: {
      enabled: true,
      // Add custom password settings with optimized hashing cost
      password: {
        hash: async (password) => {
          // Use a lower cost factor for better performance in Cloudflare Workers
          // Default Node.js implementation but with lower cost
          const crypto = require('crypto');
          const salt = crypto.randomBytes(16);
          // Use a cost factor of 8 instead of the default 16
          return new Promise<string>((resolve, reject) => {
            crypto.scrypt(password, salt, 64, { N: 8 }, (err: Error | null, derivedKey: Buffer) => {
              if (err) reject(err);
              resolve(salt.toString('hex') + ':' + derivedKey.toString('hex'));
            });
          });
        },
        verify: async ({ hash, password }) => {
          // Custom verification function for the optimized password hash
          const crypto = require('crypto');
          const [salt, key] = hash.split(':');
          // Use a cost factor of 8 instead of the default 16
          return new Promise<boolean>((resolve, reject) => {
            crypto.scrypt(password, Buffer.from(salt, 'hex'), 64, { N: 8 }, (err: Error | null, derivedKey: Buffer) => {
              if (err) reject(err);
              resolve(key === derivedKey.toString('hex'));
            });
          });
        }
      }
    },
    trustedOrigins: [
      'http://localhost:3000', 
      'http://localhost:4173', 
      'http://localhost:5173',
      'https://convex-better-auth-testing.pages.dev',
      'https://better-auth-api-cross-origin.jhonra121.workers.dev'
    ],
    advanced: {
      defaultCookieAttributes: {
        // Configure cookies for cross-domain use
        sameSite: "none" as const,
        secure: true,
        partitioned: true // For browser compatibility with new standards
      },
      // Add any additional configuration as needed
      cookies: {
        sessionToken: {
          attributes: {
            sameSite: "none" as const,
            secure: true,
            partitioned: true
          }
        },
        csrfToken: {
          attributes: {
            sameSite: "none" as const,
            secure: true,
            partitioned: true
          }
        }
      },
      // Override the handler to properly handle empty JSON bodies
      handler: {
        override: (handler: (request: Request) => Promise<Response>) => {
          return async (request: Request) => {
            try {
              return await handler(request);
            } catch (error) {
              // If the error is about JSON parsing, just continue with empty body
              if (error instanceof SyntaxError && error.message.includes('JSON')) {
                console.log('Handling empty JSON body error');
                // Create a new request with an empty JSON body
                const newRequest = new Request(request.url, {
                  method: request.method,
                  headers: request.headers,
                  body: JSON.stringify({}),
                });
                return await handler(newRequest);
              }
              throw error;
            }
          };
        }
      },
      // Add more explicit configuration for callback handling
      callbackHandler: {
        redirectAfterCallback: true,
        redirectUrl: frontendURL
      }
    }
  });
  
  // Add a wrapped handler that deals with empty bodies
  const wrappedHandler = createBetterAuthHandler(auth);
  
  // Return the auth instance with wrapped handler
  return {
    ...auth,
    handler: wrappedHandler
  };
};

export default createAuth;
