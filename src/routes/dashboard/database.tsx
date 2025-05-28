import { createFileRoute } from '@tanstack/solid-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/solid-query';
import { createSignal, createEffect, createMemo, Show, For, onCleanup } from 'solid-js';
import { protectedLoader, loadSession } from '~/lib/protectedRoute';
import { 
  fetchProfile, 
  updateProfile, 
  fetchSessions, 
  revokeSession,
  formatDate,
} from '~/lib/databaseService';

// Define types for loader data
type LoaderData = {
  initialProfileData: Awaited<ReturnType<typeof fetchProfile>>;
  initialSessionsData: Awaited<ReturnType<typeof fetchSessions>>;
};

// Define cache times (in milliseconds)
const FIVE_MINUTES = 5 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

// Database management component
function DatabasePage() {
  const queryClient = useQueryClient();
  const loaderData = Route.useRouteContext() as unknown as LoaderData;
  
  // Profile editing
  const [editMode, setEditMode] = createSignal(false);
  const [name, setName] = createSignal('');
  const [imageUrl, setImageUrl] = createSignal('');
  
  // Fetch profile data
  const profileQuery = useQuery(() => ({
    queryKey: ['profile'],
    queryFn: fetchProfile,
    retry: 1,
    initialData: loaderData.initialProfileData,
    staleTime: FIVE_MINUTES, // Consider data fresh for 5 minutes
    gcTime: ONE_HOUR, // Keep unused data in cache for 1 hour
  }));
  
  // Fetch sessions data
  const sessionsQuery = useQuery(() => ({
    queryKey: ['sessions'],
    queryFn: fetchSessions,
    retry: 1,
    initialData: loaderData.initialSessionsData,
    staleTime: FIVE_MINUTES, // Consider data fresh for 5 minutes
    gcTime: ONE_HOUR, // Keep unused data in cache for 1 hour
  }));
  
  // Create memoized values for profile data to improve reactivity
  const profileData = createMemo(() => profileQuery.data?.profile);
  // Create memoized value for sessions data
  const sessionsData = createMemo(() => sessionsQuery.data?.sessions || []);
  // Create memoized value for sessions loading state
  const isLoadingSessions = createMemo(() => sessionsQuery.isLoading);
  // Create memoized value for sessions error state
  const hasSessionsError = createMemo(() => sessionsQuery.isError);
  // Create memoized value for profile loading state
  const isLoadingProfile = createMemo(() => profileQuery.isLoading);
  // Create memoized value for profile error state
  const hasProfileError = createMemo(() => profileQuery.isError);

  // Update profile mutation
  const updateProfileMutation = useMutation(() => ({
    mutationFn: updateProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      setEditMode(false);
    },
  }));
 
  // Create memoized value for update mutation state
  const isUpdatingProfile = createMemo(() => updateProfileMutation.isPending);

  // Revoke session mutation
  const revokeSessionMutation = useMutation(() => ({
    mutationFn: revokeSession,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  }));
  
  // Initialize form when entering edit mode
  createEffect(() => {
    // Access reactive dependencies explicitly to ensure proper reactivity
    const isEditMode = editMode();
    const profile = profileData();
    
    if (isEditMode && profile) {
      setName(profile.name || '');
      setImageUrl(profile.image || '');
    }
  })
  onCleanup(() => {
    setEditMode(false);
  });
  
  // Handle profile form submission
  const handleProfileSubmit = (e: Event) => {
    e.preventDefault();
    
    // Use function form to capture current values
    const profileUpdate = {
      name: name(),
      image: imageUrl()
    };
    
    updateProfileMutation.mutate(profileUpdate);
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
        
        <Show when={isLoadingProfile()}>
          <div class="animate-pulse space-y-4">
            <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
            <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
          </div>
        </Show>
        
        <Show when={hasProfileError()}>
          <div class="text-red-500 p-4 border border-red-300 rounded-md bg-red-50 dark:bg-red-900/20">
            Error loading profile data. Please try again.
          </div>
        </Show>
        
        <Show when={profileData()}>
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
                    disabled={isUpdatingProfile()}
                    class="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                  >
                    {isUpdatingProfile() ? 'Saving...' : 'Save Changes'}
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
            <div class="space-y-3">
              <p class="text-sm">
                <span class="font-medium text-gray-600 dark:text-gray-400">Name:</span> {profileData()?.name}
              </p>
              <p class="text-sm">
                <span class="font-medium text-gray-600 dark:text-gray-400">Email:</span> {profileData()?.email}
              </p>
              <p class="text-sm">
                <span class="font-medium text-gray-600 dark:text-gray-400">Email Verified:</span> {profileData()?.emailVerified ? 'Yes' : 'No'}
              </p>
              <p class="text-sm">
                <span class="font-medium text-gray-600 dark:text-gray-400">Created At:</span> {formatDate(profileData()?.createdAt)}
              </p>
              <Show when={profileData()?.image}>
                <img src={profileData()?.image} alt="Profile" class="w-24 h-24 rounded-full mt-2" />
              </Show>
            </div>
            <button
              onClick={() => setEditMode(true)}
              class="mt-4 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Edit Profile
            </button>
          </Show>
        </Show>
      </section>

      {/* Sessions Section */}
      <section class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
        <h2 class="text-xl font-semibold mb-4">Active Sessions</h2>
        
        <Show when={isLoadingSessions()}>
          <div class="animate-pulse space-y-3">
            <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
            <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6"></div>
          </div>
        </Show>
        
        <Show when={hasSessionsError()}>
          <div class="text-red-500 p-4 border border-red-300 rounded-md bg-red-50 dark:bg-red-900/20">
            Error loading sessions. Please try again.
          </div>
        </Show>
        
        <Show when={sessionsData().length > 0}>
          <ul class="space-y-4">
            <For each={sessionsData()}>{(session) =>
              <li class="p-4 border border-gray-200 dark:border-gray-700 rounded-md flex justify-between items-center">
                <div>
                  <p class="text-sm font-medium">
                    Created: <span class="font-normal">{formatDate(session.created_at)}</span>
                  </p>
                  <p class="text-sm font-medium">
                    Expires: <span class="font-normal">{formatDate(session.expires_at)}</span>
                  </p>
                  <Show when={session.ip_address}>
                    <p class="text-xs text-gray-500 dark:text-gray-400">
                      IP: {session.ip_address}
                    </p>
                  </Show>
                  <Show when={session.user_agent}>
                    <p class="text-xs text-gray-500 dark:text-gray-400 truncate max-w-xs">
                      Device: {session.user_agent}
                    </p>
                  </Show>
                </div>
                <button
                  onClick={() => handleRevokeSession(session.id)}
                  disabled={revokeSessionMutation.isPending && revokeSessionMutation.variables === session.id}
                  class="py-1 px-3 text-sm font-medium rounded-md text-red-600 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900/30 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
                >
                  {revokeSessionMutation.isPending && revokeSessionMutation.variables === session.id ? 'Revoking...' : 'Revoke'}
                </button>
              </li>
            }</For>
          </ul>
        </Show>
        
        <Show when={sessionsData().length === 0 && !isLoadingSessions()}>
          <p class="text-gray-500 dark:text-gray-400">No active sessions found.</p>
        </Show>
      </section>
    </div>
  );
}

export const Route = createFileRoute('/dashboard/database')({
  component: DatabasePage,
  beforeLoad: () => protectedLoader(), // Ensure the user is authenticated
  loader: async ({ context }) => {
    // This happens after the sync check but before component render
    await loadSession();
    
    // Instead of calling fetch directly, use ensureQueryData to respect caching
    const initialProfileData = await context.queryClient.ensureQueryData({
      queryKey: ['profile'],
      queryFn: fetchProfile,
      staleTime: FIVE_MINUTES,
      gcTime: ONE_HOUR,
    });
    
    const initialSessionsData = await context.queryClient.ensureQueryData({
      queryKey: ['sessions'],
      queryFn: fetchSessions,
      staleTime: FIVE_MINUTES,
      gcTime: ONE_HOUR,
    });
    
    return { initialProfileData, initialSessionsData };
  },
}); 