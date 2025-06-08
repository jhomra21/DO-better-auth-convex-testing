import { createSignal } from 'solid-js';
import { Link, createFileRoute, useNavigate } from '@tanstack/solid-router';
import { useAuthContext } from '../lib/AuthProvider';
import { publicOnlyLoader } from '../lib/protectedRoute';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import GoogleSignInButton from '~/components/GoogleSignInButton';
import { Separator } from '~/components/ui/separator';

function SignUpPage() {
  const [name, setName] = createSignal('');
  const [email, setEmail] = createSignal('');
  const [password, setPassword] = createSignal('');
  const [error, setError] = createSignal<string | null>(null);
  const auth = useAuthContext();
  const navigate = useNavigate();

  const handleSignUp = async (e: Event) => {
    e.preventDefault();
    setError(null);
    const result = await auth.signup(email(), password(), name());
    if (result.error) {
      setError(result.error.message);
    } else {
      navigate({ to: '/dashboard' });
    }
  };

  return (
    <div class="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card class="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign Up</CardTitle>
          <CardDescription>Create a new account to get started.</CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <form onSubmit={handleSignUp} class="space-y-4">
            <div class="space-y-2">
              <Label for="name">Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="Your Name"
                required
                value={name()}
                onChange={setName}
              />
            </div>
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
            <Button type="submit" class="w-full" disabled={auth.isLoading()}>
              {auth.isLoading() ? 'Creating Account...' : 'Create Account'}
            </Button>
          </form>
          <Separator class="my-4" />
          <GoogleSignInButton callbackURL="/dashboard" />
          <div class="mt-4 text-center text-sm">
            Already have an account?{' '}
            <Link to="/sign-in" class="underline">
              Sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export const Route = createFileRoute('/sign-up')({
  component: SignUpPage,
  loader: publicOnlyLoader as any,
}); 