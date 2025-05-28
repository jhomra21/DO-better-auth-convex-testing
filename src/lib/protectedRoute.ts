import { redirect } from "@tanstack/solid-router";
import { hasAuthToken, getCachedSession } from './authClient';

/**
 * Creates a protected route loader that checks auth status synchronously
 * and redirects to sign-in if not authenticated.
 */
export function protectedLoader() {
  // First do a synchronous check using the token
  // This prevents any component loading or flash of content
  if (!hasAuthToken()) {
    throw redirect({
      to: "/sign-in",
      search: {
        redirect: window.location.pathname + window.location.search
      }
    });
  }

  // Return the token for immediate use while the async check proceeds
  return { token: localStorage.getItem("bearer_token") };
}

/**
 * Async session loader that uses TanStack Query's caching
 * to avoid redundant API calls for session validation
 */
export async function loadSession() {
  try {
    // Use cached session data instead of making a new API call each time
    const sessionData = await getCachedSession();
    
    if (!sessionData || !sessionData.authenticated) {
      throw redirect({
        to: "/sign-in",
        search: {
          redirect: window.location.pathname + window.location.search
        }
      });
    }
    
    return {
      session: sessionData.session,
      user: sessionData.user
    };
  } catch (error) {
    console.error("Error loading session:", error);
    throw redirect({
      to: "/sign-in",
      search: {
        redirect: window.location.pathname + window.location.search
      }
    });
  }
}

/**
 * Public route loader that redirects to home if already authenticated
 * Used for sign-in and sign-up pages
 */
export function publicOnlyLoader() {
  // Check if user is already authenticated
  if (hasAuthToken()) {
    // Redirect to home or dashboard
    throw redirect({
      to: "/"
    });
  }
  
  return {};
} 