import { createFileRoute, redirect } from '@tanstack/solid-router';
import { createSignal, createMemo, Show } from 'solid-js';
import { useAuthContext } from '~/lib/AuthProvider';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { authClient } from '~/lib/authClient';

const sessionQueryOptions = {
  queryKey: ['auth', 'session'],
  queryFn: () => authClient.getSession(),
} as const;

// Account management component
function AccountPage() {
  const { user } = useAuthContext();
  
  // Profile editing state (functionality is temporarily removed)
  const [editMode, setEditMode] = createSignal(false);
  
  const handleEditToggle = () => {
    // For now, this is a placeholder. In the future, this would enable a form.
    setEditMode(!editMode());
    // In a real implementation, you might fetch editable profile data here
    // or switch inputs to be non-disabled.
  };
  
  return (
    <div class="p-4 md:p-8 max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Account Information</CardTitle>
          <CardDescription>
            View your account details. Profile editing is temporarily disabled.
          </CardDescription>
        </CardHeader>
        <CardContent class="space-y-6">
          <div class="space-y-2">
            <Label>Email</Label>
            <Input value={user()?.email || 'N/A'} disabled />
          </div>
          <div class="space-y-2">
              <Label for="name">Name</Label>
              <div class="flex items-center gap-2">
                <Input
                  id="name"
                  value={user()?.name || 'N/A'}
                  disabled={!editMode()}
                />
                <Button type="button" variant="outline" onClick={handleEditToggle}>
                  {editMode() ? 'Cancel' : 'Edit'}
                </Button>
              </div>
            </div>
          {/* Session management UI is removed for now as it's not supported by the current auth setup */}
        </CardContent>
      </Card>
    </div>
  );
}

export const Route = createFileRoute('/dashboard/account')({
  component: AccountPage,
  loader: async ({ context, location }) => {
    const { queryClient } = context;

    try {
      const sessionData = await queryClient.ensureQueryData(sessionQueryOptions);
      
      const isAuthenticated = !!sessionData?.data?.user;
  
      if (!isAuthenticated) {
        throw redirect({
          to: '/sign-in',
          search: {
            redirect: location.href,
          },
        });
      }
  
      // No need to return loader data as the component now uses the auth context
      return null;
    } catch (error) {
      // Handle redirect errors or other exceptions
      if (error instanceof Response && error.headers.get('Location')) {
        throw error; // Re-throw the redirect response
      }
      console.error('Error during authentication check in loader, redirecting.', error);
      throw redirect({
        to: '/sign-in',
        search: {
          redirect: location.href,
        },
      });
    }
  },
}); 