import { Show, createSignal, type Component } from 'solid-js';
import { Link } from '@tanstack/solid-router';
import { useAuthContext } from '~/lib/AuthProvider';
import { apiClient } from '~/lib/apiClient';
import { Button } from '~/components/ui/button'; // Assuming you have a Button component

export const AuthExample: Component = () => {
  const auth = useAuthContext();
  const [protectedData, setProtectedData] = createSignal<any>(null);
  const [fetchError, setFetchError] = createSignal<string | null>(null);
  const [isLoadingData, setIsLoadingData] = createSignal(false);

  const handleFetchProtectedData = async () => {
    setIsLoadingData(true);
    setProtectedData(null);
    setFetchError(null);
    try {
      const data = await apiClient.get('/api/protected');
      setProtectedData(data);
    } catch (error: any) {
      setFetchError(error.message || 'Failed to fetch protected data.');
    } finally {
      setIsLoadingData(false);
    }
  };

  return (
    <div class="space-y-4 p-4 border rounded-lg shadow dark:bg-gray-800 dark:border-gray-700">
      <h2 class="text-xl font-semibold text-gray-800 dark:text-white">Authentication Status</h2>
      <Show
        when={auth.isAuthenticated()}
        fallback={
          <div>
            <p class="text-gray-600 dark:text-gray-300">You are not logged in.</p>
            <div class="mt-2 space-x-2">
              <Link to="/sign-in" class="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300">
                Sign In
              </Link>
              <Link to="/sign-up" class="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300">
                Sign Up
              </Link>
            </div>
          </div>
        }
      >
        <div>
          <p class="text-gray-700 dark:text-gray-200">
            Welcome, <span class="font-medium">{auth.user()?.email || auth.user()?.name || 'User'}</span>!
          </p>
          <Button 
            onClick={async () => await auth.logout()} 
            class="mt-2"
            variant="outline"
          >
            Logout
          </Button>
        </div>
      </Show>

      <div class="mt-6">
        <h3 class="text-lg font-medium text-gray-800 dark:text-white">Test Protected Route</h3>
        <Button 
          onClick={handleFetchProtectedData} 
          disabled={isLoadingData() || !auth.isAuthenticated()}
          class="mt-2"
        >
          {isLoadingData() ? 'Fetching...' : 'Fetch Protected Data'}
        </Button>
        <Show when={fetchError()}>
          <p class="mt-2 text-sm text-red-500">Error: {fetchError()}</p>
        </Show>
        <Show when={protectedData()}>
          <pre class="mt-2 p-2 bg-gray-100 dark:bg-gray-700 rounded text-sm overflow-x-auto">
            {JSON.stringify(protectedData(), null, 2)}
          </pre>
        </Show>
      </div>
    </div>
  );
}; 