import { createSignal, type Component, createEffect, createMemo } from 'solid-js';
import { useRouter, Link } from '@tanstack/solid-router';
import { useAuthContext, GlobalAuth } from '../lib/AuthProvider'; // Import GlobalAuth
import { createFileRoute } from '@tanstack/solid-router';
import { useAuthGuard } from '../lib/authGuard';
import GoogleSignInButton from '../components/GoogleSignInButton';
import { publicOnlyLoader } from "~/lib/protectedRoute";
import { Button } from '~/components/ui/button';

const SignUpComponent: Component = () => {
  const [name, setName] = createSignal('');
  const [email, setEmail] = createSignal('');
  const [password, setPassword] = createSignal('');
  const [error, setError] = createSignal('');
  const [isLoading, setIsLoading] = createSignal(false);
  const [signupSuccess, setSignupSuccess] = createSignal(false);
  const [navigating, setNavigating] = createSignal(false);
  
  
  const router = useRouter();
  const auth = useAuthContext();
  
  // Create a derived state for authentication status
  const isAuthenticated = createMemo(() => 
    GlobalAuth.isAuthenticated() || auth.isAuthenticated()
  );
  
  // Unified effect for navigation after authentication
  createEffect(() => {
    // Access all reactive dependencies explicitly
    const hasSignupSuccess = signupSuccess();
    const isAuthStatus = isAuthenticated();
    const isNavigating = navigating();
    
    // Only proceed if signup was successful, we're authenticated, and not already navigating
    if (hasSignupSuccess && isAuthStatus && !isNavigating) {
      setNavigating(true);
      
      // Navigate to dashboard
      navigateToDashboard();
    }
  });
  
  // Extract navigation logic to a reusable function
  const navigateToDashboard = () => {
    try {
      // Try using router navigation first
      router.navigate({ to: "/dashboard" });
    } catch (e) {
      console.error("Router navigation failed, falling back to window.location", e);
      // Fallback to direct navigation if router fails
      window.location.href = "/dashboard";
    }
  };
  
  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    
    try {
      const result = await auth.signup(email(), password(), name());
      
      if (result && result.error) {
        console.error("Signup error:", result.error);
        setError(result.error.message || 'Failed to sign up');
      } else {
        // Signup was successful
        setSignupSuccess(true);
        
        // If already authenticated, navigate immediately
        // Otherwise, the createEffect will handle it when auth state updates
        if (isAuthenticated()) {
          navigateToDashboard();
        }
      }
    } catch (err: any) {
      console.error("Signup exception:", err);
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div class="flex min-h-screen items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <div class="w-full max-w-md space-y-8 rounded-lg bg-white dark:bg-gray-800 p-6 shadow-xl">
        <div class="text-center">
          <h1 class="text-3xl font-bold text-gray-900 dark:text-white">Create Account</h1>
          <p class="mt-2 text-gray-600 dark:text-gray-300">Join us by creating a new account</p>
        </div>
        
        <form onSubmit={handleSubmit} class="mt-8 space-y-6">
          {error() && (
            <div class="rounded-md bg-red-100 dark:bg-red-900 p-4 text-sm text-red-700 dark:text-red-200">{error()}</div>
          )}
          
          <div>
            <label for="name" class="block text-sm font-medium text-gray-700 dark:text-gray-200">
              Full Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              autocomplete="name"
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
              required
              class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 sm:text-sm p-2"
            />
          </div>

          <div>
            <label for="email" class="block text-sm font-medium text-gray-700 dark:text-gray-200">
              Email Address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autocomplete="email"
              value={email()}
              onInput={(e) => setEmail(e.currentTarget.value)}
              required
              class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 sm:text-sm p-2"
            />
          </div>
          
          <div>
            <label for="password" class="block text-sm font-medium text-gray-700 dark:text-gray-200">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autocomplete="new-password"
              value={password()}
              onInput={(e) => setPassword(e.currentTarget.value)}
              required
              class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 sm:text-sm p-2"
            />
          </div>
          
          <div>
            <Button
              variant="sf-compute"
              type="submit"
              disabled={isLoading()}
              class="group relative flex w-full justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:bg-indigo-500 dark:hover:bg-indigo-600 dark:focus:ring-offset-gray-800 disabled:opacity-50"
            >
              {isLoading() ? (
                <>
                  <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Creating account...
                </>
              ) : 'Sign Up'}
            </Button>
          </div>
          
          <div class="relative mt-6">
            <div class="absolute inset-0 flex items-center">
              <div class="w-full border-t border-gray-300 dark:border-gray-600"></div>
            </div>
            <div class="relative flex justify-center text-sm">
              <span class="bg-white dark:bg-gray-800 px-2 text-gray-500 dark:text-gray-400">Or continue with</span>
            </div>
          </div>
          
          <div class="mt-6">
            <GoogleSignInButton callbackURL="/dashboard" />
          </div>
          
          <div class="text-center text-sm">
            <span class="text-gray-600 dark:text-gray-400">Already have an account?</span>{' '}
            <Link to="/sign-in" class="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300">
              Sign in
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
};

function PublicSignUpPage() {
  useAuthGuard({ requireAuth: false, homeRoute: '/dashboard' });
  return <SignUpComponent />;
}

export const Route = createFileRoute('/sign-up')({
  component: PublicSignUpPage,
  beforeLoad: () => publicOnlyLoader(),
});

// Default export is no longer needed
// export default SignUpComponent; 