import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { D1Database } from '@cloudflare/workers-types';
import * as authSchema from '../../src/db/auth-schema';
import { drizzle } from 'drizzle-orm/d1';

// Import Env type from the correct location
type Env = {
  DB: D1Database; 
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_CLIENT_ID: string;
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

// Create Better Auth instance with cross-domain support
export const createAuth = (env: Env) => {
  // Create a drizzle instance with the D1 database
  const db = drizzle(env.DB, { schema: authSchema });
  
  // Hard-code the environment based on deployment
  // For Cloudflare Workers, we'll use a constant instead of trying to detect
  const isProd = true; // Always assume production for deployed Workers
  
  // Define API URL for local development or production
  const apiUrl = 'https://better-auth-api-cross-origin.jhonra121.workers.dev';
  
  // Define frontend URL for redirects after authentication
  const frontendURL = 'https://convex-better-auth-testing.pages.dev';
    
  const auth = betterAuth({
    projectId: 'convex-better-auth',
    secretKey: env.BETTER_AUTH_SECRET,
    baseUrl: apiUrl, // API server URL
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        redirectURI: 'https://better-auth-api-cross-origin.jhonra121.workers.dev/api/auth/callback/google'
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
    // Use drizzleAdapter with the initialized db instance
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        user: authSchema.user,
        session: authSchema.session,
        account: authSchema.account,
        verification: authSchema.verification
      }
    }),
    emailAndPassword: {
      enabled: true
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
