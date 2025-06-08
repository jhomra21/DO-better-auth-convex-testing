import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Gets the base URL for the API.
 * In development, it points to the local server. In production, it points to the deployed API.
 * @returns {string} The base URL for the API.
 */
export function getApiUrl(): string {
  // In development, this should be the URL of the local Cloudflare Worker.
  if (import.meta.env.DEV) {
    // The default wrangler port is 8787.
    return 'http://127.0.0.1:8787';
  }
  // In production, we use the absolute URL of our deployed backend worker.
  return 'https://better-auth-api-cross-origin.jhonra121.workers.dev';
}

/**
 * Returns the frontend URL based on the current environment
 */
export function getFrontendUrl(): string {
  // In development, construct the URL dynamically.
  if (import.meta.env.DEV) {
    if (typeof window !== 'undefined') {
      return window.location.origin;
    }
    // Provide a fallback for server-side rendering or other contexts.
    return 'http://localhost:3000';
  }
  // In production, use the canonical URL of your deployed frontend.
  return 'https://convex-better-auth-testing.pages.dev';
}

/**
 * Returns the auth callback URL based on the current environment
 */
export function getAuthCallbackUrl(): string {
  // The callback URL needs the full path to the auth handler.
  return `${getApiUrl()}/api/auth/callback/google`;
}

/**
 * Returns the sign-in error redirect URL
 */
export function getSignInErrorUrl(): string {
  return `${getFrontendUrl()}/sign-in?error=session_error`;
}