import { redirect } from "@tanstack/solid-router";
import { hasAuthToken, getCachedSession } from './authClient';
import { GlobalAuth } from './AuthProvider';

// Global variable to hold the most recent authenticated session
// This allows bypassing TanStack Query cache immediately after login
let lastAuthSession: any = null;

// Function to set the last authenticated session (called by login/signup functions)
export function setLastAuthSession(sessionData: any) {
  lastAuthSession = sessionData;
  // Also update the global auth state
  GlobalAuth.setIsAuthenticated(true);
  GlobalAuth.setUser(sessionData.user);
}

/**
 * Creates a protected route loader that checks auth status synchronously
 * and redirects to sign-in if not authenticated.
 */
export function protectedLoader() {
  // Check global auth state first (most reliable)
  if (GlobalAuth.isAuthenticated()) {
    return { token: localStorage.getItem("bearer_token") };
  }
  
  // Fallback to token check
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
    // First check if we have a fresh auth session from recent login/signup
    if (lastAuthSession) {
      // Use the session and clear it for next time
      const sessionData = lastAuthSession;
      lastAuthSession = null; // Clear after use
      return {
        session: sessionData.session,
        user: sessionData.user
      };
    }
    
    // Check global auth state
    if (GlobalAuth.isAuthenticated() && GlobalAuth.user()) {
      // If we have user data in global auth state, use it
      return {
        user: GlobalAuth.user(),
        session: { id: 'global-session' } // Placeholder session
      };
    }
    
    // Otherwise, use cached session data from TanStack Query
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
 * 
 * @param options Optional settings
 * @param options.skipRedirect If true, don't redirect even if authenticated (for home page)
 */
export function publicOnlyLoader(options?: { skipRedirect?: boolean }) {
  // If skipRedirect is true, don't redirect authenticated users
  if (options?.skipRedirect) {
    return {};
  }

  // Check global auth state first
  if (GlobalAuth.isAuthenticated()) {
    throw redirect({
      to: "/dashboard"
    });
  }
  
  // Check if user is already authenticated via token
  if (hasAuthToken()) {
    // Redirect to dashboard
    throw redirect({
      to: "/dashboard"
    });
  }
  
  return {};
} 