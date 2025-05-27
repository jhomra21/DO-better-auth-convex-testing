import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Returns the base URL for the API.
 * In development, it points to the typical Cloudflare Workers/Hono dev server port (e.g., 8787 via wrangler)
 * In production, it uses the specific worker URL to ensure consistent cross-domain communication.
 */
export function getApiUrl(): string {
  if (import.meta.env.DEV) {
    // For local development, use the local wrangler dev server
    // Get protocol dynamically to support both http and https
    const protocol = window.location.protocol;
    // Use 127.0.0.1 instead of localhost for better compatibility with SameSite cookies
    return `${protocol}//127.0.0.1:8787`;
  } else {
    // In production, use the specific worker URL
    // This must be the exact worker URL to ensure proper CORS and cookie handling
    return 'https://better-auth-api-cross-origin.jhonra121.workers.dev';
  }
}

/**
 * Returns the frontend URL based on the current environment
 */
export function getFrontendUrl(): string {
  if (import.meta.env.DEV) {
    // For local development
    const protocol = window.location.protocol;
    return `${protocol}//localhost:3000`;
  } else {
    // In production
    return 'https://convex-better-auth-testing.pages.dev';
  }
}

/**
 * Returns the auth callback URL based on the current environment
 */
export function getAuthCallbackUrl(): string {
  return `${getApiUrl()}/api/auth/callback/google`;
}

/**
 * Returns the sign-in error redirect URL
 */
export function getSignInErrorUrl(): string {
  return `${getFrontendUrl()}/sign-in?error=session_error`;
}