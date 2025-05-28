import { createFileRoute } from '@tanstack/solid-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/solid-query';
import { createSignal, createEffect, Show, For, onMount } from 'solid-js';
import { useAuthContext } from '~/lib/AuthProvider';
import { getApiUrl } from '~/lib/utils';
import { protectedLoader, loadSession } from '~/lib/protectedRoute';

// Define types for our API responses
interface Profile {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string;
  createdAt: number;
}

interface Session {
  id: string;
  created_at: number;
  expires_at: number;
  ip_address?: string;
  user_agent?: string;
}

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  [key: string]: any;
  profile?: T;
  sessions?: T[];
}

// API interaction functions
async function fetchProfile(): Promise<ApiResponse<Profile>> {
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

async function updateProfile(data: Partial<Profile>): Promise<ApiResponse<Profile>> {
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

async function fetchSessions(): Promise<ApiResponse<Session>> {
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

async function revokeSession(sessionId: string): Promise<ApiResponse<null>> {
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
function formatDate(timestamp: number | undefined): string {
  if (!timestamp) return 'Unknown';
  
  // Convert seconds to milliseconds for JavaScript Date
  // Unix timestamps are in seconds, but JS Date expects milliseconds
  const date = new Date(timestamp * 1000);
  
  return date.toLocaleString();
}

// Database management component
function DatabasePage() {
  const queryClient = useQueryClient();
  const auth = useAuthContext();
  
  // Remove redundant session refresh on mount
  // We're now using cached session data
  
  // Profile editing
  const [editMode, setEditMode] = createSignal(false);
  const [name, setName] = createSignal('');
  const [imageUrl, setImageUrl] = createSignal('');
  
  // Fetch profile data
  const profileQuery = useQuery(() => ({
    queryKey: ['profile'],
    queryFn: fetchProfile,
    retry: 1,
  }));
  
  // Fetch sessions data
  const sessionsQuery = useQuery(() => ({
    queryKey: ['sessions'],
    queryFn: fetchSessions,
    retry: 1,
  }));
  
  // Update profile mutation
  const updateProfileMutation = useMutation(() => ({
    mutationFn: updateProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      setEditMode(false);
    },
  }));
  
  // Revoke session mutation
  const revokeSessionMutation = useMutation(() => ({
    mutationFn: revokeSession,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  }));
  
  // Initialize form when entering edit mode
  createEffect(() => {
    if (editMode() && profileQuery.data) {
      setName(profileQuery.data.profile?.name || '');
      setImageUrl(profileQuery.data.profile?.image || '');
    }
  });
  
  // Handle profile form submission
  const handleProfileSubmit = (e: Event) => {
    e.preventDefault();
    updateProfileMutation.mutate({
      name: name(),
      image: imageUrl()
    });
  };
  
  // Handle session revocation
  const handleRevokeSession = (sessionId: string) => {
    if (confirm('Are you sure you want to revoke this session?')) {
      revokeSessionMutation.mutate(sessionId);
    }
  };
  
  return (
    <div class="p-4 md:p-6 lg:p-8 max-w-5xl mx-auto space-y-12">
      <h1 class="text-3xl font-bold text-gray-800 dark:text-gray-200 mb-8">Account Management</h1>
      
      {/* Profile Section */}
      <section class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
        <h2 class="text-xl font-semibold mb-4">Profile Information</h2>
        
        <Show when={profileQuery.isLoading}>
          <div class="animate-pulse space-y-4">
            <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
            <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
          </div>
        </Show>
        
        <Show when={profileQuery.isError}>
          <div class="text-red-500 p-4 border border-red-300 rounded-md bg-red-50 dark:bg-red-900/20">
            Error loading profile data. Please try again.
          </div>
        </Show>
        
        <Show when={profileQuery.data?.profile}>
          <Show
            when={!editMode()}
            fallback={
              <form onSubmit={handleProfileSubmit} class="space-y-4">
                <div>
                  <label for="name" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Name
                  </label>
                  <input
                    id="name"
                    type="text"
                    value={name()}
                    onInput={(e) => setName(e.target.value)}
                    class="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700"
                  />
                </div>
                
                <div>
                  <label for="imageUrl" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Profile Image URL
                  </label>
                  <input
                    id="imageUrl"
                    type="text"
                    value={imageUrl()}
                    onInput={(e) => setImageUrl(e.target.value)}
                    class="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700"
                  />
                </div>
                
                <div class="flex space-x-2">
                  <button
                    type="submit"
                    disabled={updateProfileMutation.isPending}
                    class="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                  >
                    {updateProfileMutation.isPending ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditMode(false)}
                    class="inline-flex justify-center py-2 px-4 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            }
          >
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400">Name</h3>
                <p class="mt-1 text-lg">{profileQuery.data?.profile?.name}</p>
              </div>
              
              <div>
                <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400">Email</h3>
                <p class="mt-1 text-lg">{profileQuery.data?.profile?.email}</p>
              </div>
              
              <div>
                <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400">Account Created</h3>
                <p class="mt-1">{formatDate(profileQuery.data?.profile?.createdAt)}</p>
              </div>
              
              <div>
                <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400">Email Verified</h3>
                <p class="mt-1">
                  {profileQuery.data?.profile?.emailVerified ? (
                    <span class="text-green-600 dark:text-green-400">Verified</span>
                  ) : (
                    <span class="text-red-600 dark:text-red-400">Not Verified</span>
                  )}
                </p>
              </div>
            </div>
            
            <div class="mt-4">
              <button
                onClick={() => setEditMode(true)}
                class="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Edit Profile
              </button>
            </div>
          </Show>
        </Show>
      </section>
      
      {/* Active Sessions Section */}
      <section class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
        <h2 class="text-xl font-semibold mb-4">Active Sessions</h2>
        
        <Show when={sessionsQuery.isLoading}>
          <div class="animate-pulse space-y-4">
            <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
            <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6"></div>
            <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-4/6"></div>
          </div>
        </Show>
        
        <Show when={sessionsQuery.isError}>
          <div class="text-red-500 p-4 border border-red-300 rounded-md bg-red-50 dark:bg-red-900/20">
            Error loading session data. Please try again.
          </div>
        </Show>
        
        <Show when={sessionsQuery.data?.sessions}>
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead class="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Device/Browser
                  </th>
                  <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    IP Address
                  </th>
                  <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Created
                  </th>
                  <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Expires
                  </th>
                  <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                <For each={sessionsQuery.data?.sessions}>
                  {(session) => (
                    <tr>
                      <td class="px-6 py-4 whitespace-nowrap text-sm">
                        {session.user_agent || 'Unknown Device'}
                      </td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm">
                        {session.ip_address || 'Unknown IP'}
                      </td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm">
                        {formatDate(session.created_at)}
                      </td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm">
                        {formatDate(session.expires_at)}
                      </td>
                      <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleRevokeSession(session.id)}
                          disabled={revokeSessionMutation.isPending}
                          class="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 focus:outline-none focus:underline disabled:opacity-50"
                        >
                          Revoke
                        </button>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
            
            <Show when={sessionsQuery.data?.sessions?.length === 0}>
              <div class="text-center py-4 text-gray-500 dark:text-gray-400">
                No active sessions found.
              </div>
            </Show>
          </div>
        </Show>
      </section>
    </div>
  );
}

export const Route = createFileRoute('/database')({
  component: DatabasePage,
  beforeLoad: () => protectedLoader(),
  loader: async () => {
    // This happens after the sync check but before component render
    return await loadSession();
  },
});