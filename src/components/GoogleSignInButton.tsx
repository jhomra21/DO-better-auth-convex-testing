import { createSignal } from 'solid-js';
import { useAuthContext } from '~/lib/AuthProvider';
import { Button } from './ui/button';

interface GoogleSignInButtonProps {
  callbackURL?: string;
}

export default function GoogleSignInButton(props: GoogleSignInButtonProps) {
  const [isLoading, setIsLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const auth = useAuthContext();

  const handleSignIn = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await auth.loginWithGoogle(props.callbackURL);
      if (result.error) {
        setError(result.error.message);
        setIsLoading(false);
      }
      // On success, the browser will be redirected, so we don't need to set loading to false.
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred during Google Sign-In.');
      setIsLoading(false);
    }
  };

  return (
    <div class="space-y-2">
      <Button
        variant="outline"
        class="w-full"
        onClick={handleSignIn}
        disabled={isLoading()}
      >
        {isLoading() ? (
          'Redirecting...'
        ) : (
          <>
            <svg class="mr-2 h-4 w-4" aria-hidden="true" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512">
              <path fill="currentColor" d="M488 261.8C488 403.3 381.5 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 126 21.2 174 57.9l-66.2 66.2C324.1 100.3 288.9 88 248 88c-88.3 0-160 71.7-160 160s71.7 160 160 160c94.4 0 135.2-72.3 140.9-109.2H248v-75.5h236.1c2.3 12.7 3.9 26.1 3.9 40.7z"></path>
            </svg>
            Sign in with Google
          </>
        )}
      </Button>
      {error() && <p class="text-red-500 text-sm">{error()}</p>}
    </div>
  );
} 