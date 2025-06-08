import { getApiUrl } from './utils';

// Helper function to create authenticated fetch requests.
// It ensures that credentials (like cookies) are sent with each request.
export function createAuthenticatedFetch() {
  return (input: RequestInfo | URL, init?: RequestInit) => {
    // The browser automatically sends HttpOnly cookies on cross-origin requests
    // when 'credentials: include' is used. We do not need to manually handle tokens.
    
    // Return the fetch call with credentials included.
    return fetch(input, { 
      ...init, 
      credentials: 'include' // Required for sending cookies cross-origin.
    });
  };
}

// Create an authenticated fetch instance to be used across the app.
export const authFetch = createAuthenticatedFetch();

// Helper function to get the current session from the backend.
export async function getSession(): Promise<SessionResponse> {
  try {
    const response = await authFetch(`${getApiUrl()}/session`);
    if (response.ok) {
      // The backend returns session data if the user is authenticated.
      return await response.json();
    }
    // If the response is not OK (e.g., 401), the user is not authenticated.
    return { authenticated: false };
  } catch (error) {
    // This catches network errors etc.
    console.error('Error fetching session:', error);
    return { authenticated: false };
  }
}

// Export types for the API responses
export type SessionResponse = {
  authenticated: boolean;
  user?: {
    id: string;
    email: string;
    name?: string;
    emailVerified?: boolean;
    image?: string;
    createdAt?: number;
  };
  session?: {
    id: string;
    user_id: string; // Matches the database column name
    expires_at: number; // Matches the database column name
    token?: string;
    created_at?: number;
    updated_at?: number;
    ip_address?: string;
    user_agent?: string;
  };
}; 