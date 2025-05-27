import { createSignal, type Component, Show } from 'solid-js';
import { useAuthContext } from '../lib/AuthProvider';
import { createFileRoute } from '@tanstack/solid-router';
import { Link } from '@tanstack/solid-router';

const HomePage: Component = () => {
  const auth = useAuthContext();
  const [isLoggingOut, setIsLoggingOut] = createSignal(false);
  
  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await auth.logout();
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      setIsLoggingOut(false);
    }
  };
  
  return (
    <div class="p-6">
      <h1 class="text-3xl font-bold mb-6">Data & Auth Management</h1>
      
      <div class="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 class="text-xl font-semibold mb-4">Authentication Status</h2>
        
        <Show
          when={auth.isAuthenticated()}
          fallback={
            <div>
              <p class="mb-4">You are not logged in.</p>
              <div class="space-x-2">
                <Link 
                  to="/sign-in" 
                  class="text-indigo-600 hover:text-indigo-800"
                >
                  Sign In
                </Link>
                <Link 
                  to="/sign-up" 
                  class="text-indigo-600 hover:text-indigo-800"
                >
                  Sign Up
                </Link>
              </div>
            </div>
          }
        >
          <div>
            <p class="mb-2">You are logged in as: <span class="font-semibold">{auth.user()?.email || 'Unknown User'}</span></p>
            <button
              onClick={handleLogout}
              disabled={isLoggingOut()}
              class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded disabled:opacity-50"
            >
              {isLoggingOut() ? 'Logging out...' : 'Sign Out'}
            </button>
          </div>
        </Show>
      </div>
      
      <div class="bg-white rounded-lg shadow-md p-6">
        <h2 class="text-xl font-semibold mb-4">Test Protected Route</h2>
        <button 
          class="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded disabled:opacity-50"
          disabled={!auth.isAuthenticated()}
        >
          Fetch Protected Data
        </button>
      </div>
    </div>
  );
};

export const Route = createFileRoute('/')({
  component: HomePage,
});
