import { createSignal } from 'solid-js';
import type { Component } from 'solid-js';
import { useAuthContext, GlobalAuth } from '~/lib/AuthProvider';
import { Show } from 'solid-js';
import { useRouter } from '@tanstack/solid-router';
import { Button } from './ui/button';

interface GoogleSignInButtonProps {
  callbackURL?: string;
  class?: string;
}

const GoogleSignInButton: Component<GoogleSignInButtonProps> = (props) => {
  const auth = useAuthContext();
  const router = useRouter();
  const [isLoading, setIsLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await auth.loginWithGoogle(props.callbackURL);
      if (result.error) {
        setError(result.error.message);
      } else if (GlobalAuth.isAuthenticated() && props.callbackURL) {
        // If we have global auth state and a callback URL, try router navigation
        try {
          router.navigate({ to: props.callbackURL });
        } catch (e) {
          console.error("Router navigation failed after Google login, using direct navigation", e);
          window.location.href = props.callbackURL;
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div class="w-full">
      <Button
        variant="sf-compute"
        type="button"
        onClick={handleGoogleSignIn}
        disabled={isLoading()}
        class={`flex w-full items-center justify-center gap-2 rounded-md border bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${props.class || ''}`}
      >
        <Show when={!isLoading()} fallback={
          <div class="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-indigo-600"></div>
        }>
          <svg class="h-3 w-3" aria-hidden="true" viewBox="0 0 24 24">
            <path
              d="M12.545 10.239v3.821h5.445c-.712 2.315-2.647 3.972-5.445 3.972a6.033 6.033 0 1 1 0-12.064c1.498 0 2.866.549 3.921 1.453l2.814-2.814A9.969 9.969 0 0 0 12.545 2C8.963 2 5.835 3.577 3.739 6.048c-2.995 3.535-2.585 8.875.971 11.927 2.466 2.121 5.856 2.825 9.006 2.001 3.169-.826 5.644-3.231 6.432-6.395.394-1.556.433-3.259.065-4.837H12.545v3.494Z"
              fill="#4285F4"
            />
          </svg>
          <span>Sign in with Google</span>
        </Show>
      </Button>
      
      <Show when={error()}>
        <p class="mt-2 text-sm text-red-600" role="alert">
          {error()}
        </p>
      </Show>
    </div>
  );
};

export default GoogleSignInButton; 