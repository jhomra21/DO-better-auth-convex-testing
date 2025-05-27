import { API_URL } from './authClient';

// Helper function to create authenticated fetch requests
export function createAuthenticatedFetch() {
  return (input: RequestInfo | URL, init?: RequestInit) => {
    // Get the auth token from localStorage
    const token = localStorage.getItem('bearer_token');
    
    // Prepare headers with Authorization if token exists
    const headers = new Headers(init?.headers);
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    
    // Return the fetch with credentials included
    return fetch(input, { 
      ...init, 
      headers,
      credentials: 'include' // Required for sending cookies cross-origin
    });
  };
}

// Create an authenticated fetch instance
export const authFetch = createAuthenticatedFetch();

// Helper function to get the current session
export async function getSession(): Promise<SessionResponse> {
  try {
    const response = await authFetch(`${API_URL}/session`);
    if (response.ok) {
      return await response.json();
    }
    return { authenticated: false };
  } catch (error) {
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
  };
  session?: {
    id: string;
    userId: string;
    expiresAt: number;
  };
}; 