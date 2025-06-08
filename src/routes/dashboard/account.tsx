import { createFileRoute } from '@tanstack/solid-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/solid-query';
import { createSignal, createEffect, createMemo, Show, For, onCleanup } from 'solid-js';
import { protectedRouteLoader } from '~/lib/protectedRoute';
import { 
  fetchProfile, 
  updateProfile, 
  fetchSessions, 
  revokeSession,
  formatDate,
} from '~/lib/databaseService';
import { useAuthContext } from '~/lib/AuthProvider';
import { Route as DashboardRoute } from '../dashboard';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';

// Define types for loader data
type LoaderData = {
  initialProfileData: Awaited<ReturnType<typeof fetchProfile>>;
  initialSessionsData: Awaited<ReturnType<typeof fetchSessions>>;
};

// Define cache times (in milliseconds)
const FIVE_MINUTES = 5 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

// Account management component
function AccountPage() {
  const queryClient = useQueryClient();
  const sessionData = DashboardRoute.useLoaderData();
  const user = () => sessionData()?.user;
  const auth = useAuthContext();
  
  // Profile editing
  const [editMode, setEditMode] = createSignal(false);
  const [name, setName] = createSignal(user()?.name || '');
  const [imageUrl, setImageUrl] = createSignal('');
  
  // Fetch profile data
  const profileQuery = useQuery(() => ({
    queryKey: ['profile'],
    queryFn: fetchProfile,
    retry: 1,
    initialData: sessionData()?.initialProfileData,
    staleTime: FIVE_MINUTES, // Consider data fresh for 5 minutes
    gcTime: ONE_HOUR, // Keep unused data in cache for 1 hour
  }));
  
  // Fetch sessions data
  const sessionsQuery = useQuery(() => ({
    queryKey: ['sessions'],
    queryFn: fetchSessions,
    retry: 1,
    initialData: sessionData()?.initialSessionsData,
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
    <div class="p-4 md:p-8 max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Account Information</CardTitle>
          <CardDescription>Manage your account settings.</CardDescription>
        </CardHeader>
        <CardContent class="space-y-6">
          <div class="space-y-2">
            <Label>Email</Label>
            <Input value={user()?.email || 'N/A'} disabled />
          </div>
          <form onSubmit={handleProfileSubmit} class="space-y-4">
            <div class="space-y-2">
              <Label for="name">Name</Label>
              <div class="flex items-center gap-2">
                <Input
                  id="name"
                  value={name()}
                  onChange={setName}
                  disabled={!editMode()}
                />
                <Button type="button" variant="outline" onClick={() => setEditMode(false)}>
                  {editMode() ? 'Cancel' : 'Edit'}
                </Button>
              </div>
            </div>
            {editMode() && (
              <Button type="submit" disabled={isUpdatingProfile()}>
                {isUpdatingProfile() ? 'Saving...' : 'Save Changes'}
              </Button>
            )}
          </form>
          {hasProfileError() && <p class="text-red-500 text-sm">{hasProfileError()}</p>}
        </CardContent>
      </Card>
    </div>
  );
}

export const Route = createFileRoute('/dashboard/account')({
  component: AccountPage,
  loader: protectedRouteLoader as any,
}); 