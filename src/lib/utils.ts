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
 * Detect if the current device is running iOS
 * This is used to provide iOS-specific authentication workarounds
 */
export function isIOS(): boolean {
  const userAgent = navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(userAgent) || 
    // Detect iPadOS which reports as Mac
    (userAgent.includes('mac') && navigator.maxTouchPoints > 0);
}

/**
 * Detect if the current browser is Safari (including WebKit-based browsers on iOS)
 */
export function isSafari(): boolean {
  const userAgent = navigator.userAgent.toLowerCase();
  return userAgent.includes('safari') && !userAgent.includes('chrome');
}

/**
 * Tests CORS connectivity to the auth API server
 * Useful for diagnosing CORS issues
 */
export async function testCORSConnectivity(): Promise<{success: boolean, message: string}> {
  try {
    const response = await fetch(`${getApiUrl()}/api/cors-test`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Cache-Control': 'no-cache'
      },
      credentials: 'include',
      cache: 'no-store'
    });
    
    if (!response.ok) {
      return { 
        success: false, 
        message: `CORS test failed with status: ${response.status}` 
      };
    }
    
    const data = await response.json() as { message: string };
    return { 
      success: true, 
      message: `CORS working: ${data.message}` 
    };
  } catch (error) {
    return { 
      success: false, 
      message: `CORS test error: ${error instanceof Error ? error.message : String(error)}` 
    };
  }
}

/**
 * Store token in localStorage as a fallback for iOS devices
 * that might have issues with cross-domain cookies
 */
export function storeAuthToken(token: string): void {
  try {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_token_timestamp', Date.now().toString());
  } catch (e) {
    console.error('Failed to store auth token in localStorage:', e);
  }
}

/**
 * Get stored auth token from localStorage
 */
export function getStoredAuthToken(): string | null {
  try {
    return localStorage.getItem('auth_token');
  } catch (e) {
    console.error('Failed to get auth token from localStorage:', e);
    return null;
  }
}

/**
 * Clear stored auth token from localStorage
 */
export function clearStoredAuthToken(): void {
  try {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_token_timestamp');
  } catch (e) {
    console.error('Failed to clear auth token from localStorage:', e);
  }
}
