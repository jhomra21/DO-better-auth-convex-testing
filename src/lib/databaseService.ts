import { getApiUrl } from './utils';

// Define types for our API responses
export interface Profile {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string;
  createdAt: number;
}

export interface Session {
  id: string;
  created_at: number;
  expires_at: number;
  ip_address?: string;
  user_agent?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  [key: string]: any;
  profile?: T;
  sessions?: T[];
}

// API interaction functions
export async function fetchProfile(): Promise<ApiResponse<Profile>> {
  const token = localStorage.getItem('bearer_token');
  
  const response = await fetch(`${getApiUrl()}/api/protected/profile`, {
    headers: {
      'Authorization': `Bearer ${token}`
    },
    credentials: 'include' // Important for cross-domain cookies
  });
  
  if (!response.ok) {
    console.error('Profile fetch error:', response.status, response.statusText);
    throw new Error('Failed to fetch profile');
  }
  
  return response.json();
}

export async function updateProfile(data: Partial<Profile>): Promise<ApiResponse<Profile>> {
  const response = await fetch(`${getApiUrl()}/api/protected/profile`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('bearer_token')}`
    },
    body: JSON.stringify(data),
    credentials: 'include'
  });
  
  if (!response.ok) {
    throw new Error('Failed to update profile');
  }
  
  return response.json();
}

export async function fetchSessions(): Promise<ApiResponse<Session>> {
  const token = localStorage.getItem('bearer_token');
  
  const response = await fetch(`${getApiUrl()}/api/protected/sessions`, {
    headers: {
      'Authorization': `Bearer ${token}`
    },
    credentials: 'include' // Important for cross-domain cookies
  });
  
  if (!response.ok) {
    console.error('Sessions fetch error:', response.status, response.statusText);
    throw new Error('Failed to fetch sessions');
  }
  
  return response.json();
}

export async function revokeSession(sessionId: string): Promise<ApiResponse<null>> {
  const response = await fetch(`${getApiUrl()}/api/protected/sessions/${sessionId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('bearer_token')}`
    },
    credentials: 'include'
  });
  
  if (!response.ok) {
    throw new Error('Failed to revoke session');
  }
  
  return response.json();
}

// Format date helper
export function formatDate(timestamp: number | undefined): string {
  if (!timestamp) return 'Unknown';
  
  // Convert seconds to milliseconds for JavaScript Date
  // Unix timestamps are in seconds, but JS Date expects milliseconds
  const date = new Date(timestamp * 1000);
  
  return date.toLocaleString();
} 