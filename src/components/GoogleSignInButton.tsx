import { createSignal } from 'solid-js';
import type { Component } from 'solid-js';
import { useAuthContext, GlobalAuth } from '~/lib/AuthProvider';
import { Show } from 'solid-js';
import { useRouter } from '@tanstack/solid-router';
import { Button } from './ui/button';
import { Icon } from './ui/icon';

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
          <Icon name="google" />
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