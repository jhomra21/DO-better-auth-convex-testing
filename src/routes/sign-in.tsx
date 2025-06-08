import { createSignal } from 'solid-js';
import { Link, createFileRoute, useNavigate, redirect } from '@tanstack/solid-router';
import { useAuthContext } from '../lib/AuthProvider';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import GoogleSignInButton from '~/components/GoogleSignInButton';
import { Separator } from '~/components/ui/separator';
import { Icon } from '~/components/ui/icon';
import { authClient } from '~/lib/authClient';

const sessionQueryOptions = {
  queryKey: ['auth', 'session'],
  queryFn: () => authClient.getSession(),
} as const;

function SignInPage() {
  const [email, setEmail] = createSignal('test@test.com');
  const [password, setPassword] = createSignal('12345678');
  const [error, setError] = createSignal<string | null>(null);
  const [isLoading, setIsLoading] = createSignal(false);
  const auth = useAuthContext();
  const navigate = useNavigate();

  const handleSignIn = async (e: Event) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const result = await auth.login(email(), password());
      if (result.error) {
        setError(result.error.message);
      } else {
        navigate({ to: '/dashboard' });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div class="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card class="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign In</CardTitle>
          <CardDescription>Enter your credentials to access your account.</CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <form onSubmit={handleSignIn} class="space-y-4">
            <div class="space-y-2">
              <Label for="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="m@example.com"
                required
                value={email()}
                onChange={setEmail}
              />
            </div>
            <div class="space-y-2">
              <Label for="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                value={password()}
                onChange={setPassword}
              />
            </div>
            {error() && <p class="text-red-500 text-sm">{error()}</p>}
            <Button type="submit" class="w-full" variant="sf-compute" disabled={isLoading()}>
              {isLoading() ? (
                <>
                  <Icon name="history" class="mr-2 h-4 w-4 animate-spin" />
                  <span>Signing In...</span>
                </>
              ) : (
                'Sign In'
              )}
            </Button>
          </form>
          <Separator class="my-4" />
          <GoogleSignInButton callbackURL="/dashboard" />
          <div class="mt-4 text-center text-sm">
            Don't have an account?{' '}
            <Link to="/sign-up" class="underline">
              Sign up
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export const Route = createFileRoute('/sign-in')({
  component: SignInPage,
  loader: async ({ context }) => {
    const { queryClient } = context;

    try {
      const sessionData = await queryClient.fetchQuery(sessionQueryOptions);
      if (sessionData?.data?.user) {
        throw redirect({
          to: '/dashboard',
        });
      }
    } catch (error) {
      if (error instanceof Response && error.headers.get('Location')) {
        throw error; // Re-throw the redirect response
      }
      // Errors are expected if the user is not logged in, so we can ignore them.
    }
  
    return null;
  },
}); 