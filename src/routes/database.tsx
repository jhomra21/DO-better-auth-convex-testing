import { createFileRoute } from '@tanstack/solid-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/solid-query';
import { createSignal, createEffect, Show, For, onMount } from 'solid-js';
import { useAuthContext } from '~/lib/AuthProvider';
import { useAuthGuard } from '~/lib/authGuard';
import { getApiUrl } from '~/lib/utils';

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
function DatabasePageComponent() {
  const queryClient = useQueryClient();
  const auth = useAuthContext();
  
  // Debug token and refresh session on mount
  onMount(async () => {
    try {
      // First refresh the session to ensure we have the latest state
      await auth.refreshSession();
    } catch (error) {
      console.error('Session/token debug error:', error);
    }
  });
  
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
          <div class="flex items-center justify-center p-4">
            <div class="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
          </div>
        </Show>
        
        <Show when={profileQuery.isError}>
          <div class="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-md">
            Failed to load profile information
          </div>
        </Show>
        
        <Show when={profileQuery.data && !editMode()}>
          <div class="space-y-4">
            <div class="flex items-start gap-4">
              <div class="flex-shrink-0">
                <div class="w-20 h-20 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                  <Show when={profileQuery.data?.profile?.image} fallback={
                    <div class="w-full h-full flex items-center justify-center bg-indigo-100 dark:bg-indigo-900/30">
                      <span class="text-lg text-indigo-600 dark:text-indigo-400">
                        {profileQuery.data?.profile?.name?.[0]?.toUpperCase() || '?'}
                      </span>
                    </div>
                  }>
                    <img 
                      src={profileQuery.data?.profile?.image} 
                      alt="Profile" 
                      class="w-full h-full object-cover"
                    />
                  </Show>
                </div>
              </div>
              
              <div class="flex-grow">
                <h3 class="text-lg font-medium">{profileQuery.data?.profile?.name}</h3>
                <p class="text-sm text-gray-500 dark:text-gray-400">{profileQuery.data?.profile?.email}</p>
                <div class="mt-1 text-xs">
                  <span class={`inline-flex items-center px-2 py-0.5 rounded-full ${
                    profileQuery.data?.profile?.emailVerified 
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' 
                      : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                  }`}>
                    {profileQuery.data?.profile?.emailVerified ? 'Verified' : 'Not Verified'}
                  </span>
                </div>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Member since {formatDate(profileQuery.data?.profile?.createdAt)}
                </p>
              </div>
            </div>
            
            <div class="flex justify-end">
              <button 
                onClick={() => setEditMode(true)}
                class="px-3 py-1.5 text-sm bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-900/20 dark:hover:bg-indigo-900/30 dark:text-indigo-400 rounded-md transition-colors"
              >
                Edit Profile
              </button>
            </div>
          </div>
        </Show>
        
        <Show when={editMode()}>
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
                class="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                required
              />
            </div>
            
            <div>
              <label for="imageUrl" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Profile Image URL
              </label>
              <input
                id="imageUrl"
                type="url"
                value={imageUrl()}
                onInput={(e) => setImageUrl(e.target.value)}
                class="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            
            <div class="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setEditMode(false)}
                class="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-300 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={updateProfileMutation.isPending}
                class="px-3 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {updateProfileMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Show>
      </section>
      
      {/* Sessions Section */}
      <section class="bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-100 dark:border-gray-700 shadow-sm p-6">
        <h2 class="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">Active Sessions</h2>
        
        <Show when={sessionsQuery.isLoading}>
          <div class="flex items-center justify-center p-4">
            <div class="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
          </div>
        </Show>
        
        <Show when={sessionsQuery.isError}>
          <div class="bg-red-50/70 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-md">
            Failed to load session information
          </div>
        </Show>
        
        <Show when={sessionsQuery.data}>
          <div class="space-y-2">
            <For each={sessionsQuery.data?.sessions}>
              {(session) => {
                const isCurrentSession = session.id === auth.session()?.id;
                
                return (
                  <div class={`p-3 rounded-lg transition-all ${isCurrentSession ? 'bg-indigo-50/70 dark:bg-indigo-900/20 border-l-4 border-indigo-400 dark:border-indigo-500' : 'bg-gray-50/70 dark:bg-gray-800/70 hover:bg-gray-100/80 dark:hover:bg-gray-700/50'}`}>
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div class="flex-grow">
                        <div class="flex items-center gap-2">
                          <div class="text-gray-600 dark:text-gray-300 text-sm font-medium truncate max-w-[250px]">
                            {session.user_agent || 'Unknown Device'}
                          </div>
                          {isCurrentSession && (
                            <span class="text-xs px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full">Current</span>
                          )}
                        </div>
                        <div class="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-gray-500 dark:text-gray-400">
                          <div class="flex items-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span>Created {formatDate(session.created_at)}</span>
                          </div>
                          <div class="flex items-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span>Expires {formatDate(session.expires_at)}</span>
                          </div>
                          <Show when={session.ip_address}>
                            <div class="flex items-center gap-1 group relative">
                              <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                              </svg>
                              <span class="truncate max-w-[100px] cursor-help">IP: {session.ip_address?.split('.').slice(0, 2).join('.')}.***.***</span>
                              <div class="absolute bottom-full left-0 mb-1 hidden group-hover:block bg-gray-800 text-white text-xs rounded py-1 px-2 whitespace-nowrap">
                                Full IP: {session.ip_address}
                              </div>
                            </div>
                          </Show>
                        </div>
                      </div>
                      <Show when={!isCurrentSession}>
                        <button
                          onClick={() => handleRevokeSession(session.id)}
                          disabled={revokeSessionMutation.isPending}
                          class="text-xs px-3 py-1 bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-900/20 dark:hover:bg-red-900/30 dark:text-red-400 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Revoke
                        </button>
                      </Show>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>
          
          <Show when={sessionsQuery.data?.sessions?.length === 0}>
            <div class="text-center py-8 text-gray-500 dark:text-gray-400">
              No active sessions found
            </div>
          </Show>
        </Show>
      </section>
    </div>
  );
}

// Wrapper component that applies the auth guard
function ProtectedDatabasePage() {
  useAuthGuard({ requireAuth: true });
  return <DatabasePageComponent />;
}

export const Route = createFileRoute('/database')({
  component: ProtectedDatabasePage,
  preload: true,
});