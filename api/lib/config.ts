/**
 * Configuration helper for environment-specific settings
 */

type Env = {
  NODE_ENV?: string;
  // Add other environment variables as needed
};

/**
 * Get the frontend URL based on the current environment
 */
export function getFrontendUrl(env: Env): string {
  return env.NODE_ENV === 'development' || !env.NODE_ENV
    ? 'http://localhost:3000/dashboard'
    : 'https://convex-better-auth-testing.pages.dev/dashboard';
}

/**
 * Get the API URL based on the current environment
 */
export function getApiUrl(env: Env): string {
  return env.NODE_ENV === 'development' || !env.NODE_ENV
    ? 'http://127.0.0.1:8787'
    : 'https://better-auth-api-cross-origin.jhonra121.workers.dev';
}

/**
 * Get the auth callback URL based on the current environment
 */
export function getAuthCallbackUrl(env: Env): string {
  return `${getApiUrl(env)}/api/auth/callback/google`;
}

/**
 * Get the sign-in error redirect URL
 */
export function getSignInErrorUrl(env: Env): string {
  return `${getFrontendUrl(env)}/sign-in?error=session_error`;
} 