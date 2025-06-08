import { createAuthClient } from "better-auth/solid";
import type { createAuth } from "../../api/lib/auth";
import { inferAdditionalFields } from "better-auth/client/plugins";
import { getApiUrl } from './utils';

// Infer the auth instance type from the return type of the server's createAuth function.
type Auth = ReturnType<typeof createAuth>;

/**
 * Create the Better Auth client instance for SolidJS.
 * We are switching from the generic 'better-auth/client' to 'better-auth/solid'
 * to leverage Solid-specific hooks and helpers.
 */
export const authClient = createAuthClient({
  baseURL: getApiUrl(), // The base URL should point to your Hono server root
  plugins: [
    // This plugin infers user/session types from your server-side auth definition.
    inferAdditionalFields<Auth>()
  ],
  fetchOptions: {
    // We still need `credentials: 'include'` for the browser to send cookies
    // to the cross-domain API. Better Auth will handle the session automatically.
    credentials: 'include',
  },
  queryOptions: {
    // This is the correct place to configure TanStack Query options for the auth client.
    // We enable refetchOnWindowFocus to ensure session data is always fresh.
    refetchOnWindowFocus: true,
  }
});

/**
 * The `googleLogin` function is simplified to call the auth client's social sign-in method.
 * The server-side configuration will handle the OAuth callback and redirect back to the frontend.
 * @param callbackURL Optional URL to redirect to after successful login.
 */
export const googleLogin = async (callbackURL?: string) => {
  return await authClient.signIn.social({
    provider: "google",
    callbackURL: callbackURL || '/dashboard'
  });
};

// All other functions previously in this file (`enhancedLogin`, `saveToken`, `getSession`, etc.)
// have been removed as they are now handled by the `authClient` and its cookie-based
// session management, or they will be replaced by the `useAuth` hook's implementation. 