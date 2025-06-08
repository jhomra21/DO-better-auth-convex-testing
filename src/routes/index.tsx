import { createFileRoute, useRouter } from '@tanstack/solid-router';
import type { Component } from 'solid-js';
import { Show } from 'solid-js';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '~/components/ui/card';
import Footer from '~/components/Footer';
import { authClient } from '~/lib/authClient';
import type { QueryClient } from '@tanstack/solid-query';
import type { RouterContext } from './dashboard'; // Reuse context from dashboard

const sessionQueryOptions = {
  queryKey: ["auth", "session"],
  retry: 0,
  queryFn: () => authClient.getSession(),
};

const HomePage: Component = () => {
  const session = Route.useLoaderData();
  const isAuthenticated = () => !!session()?.data?.user;
  const router = useRouter();

  return (
    <div class="p-8 min-h-screen flex flex-col bg-gradient-to-br from-stone-50 via-stone-100 to-stone-400/60 text-gray-900">
      <div class="max-w-2xl mx-auto w-full flex flex-col flex-grow">
        <h1 class="text-3xl font-bold mb-6">
          D1 Better Auth, Durable Objects [DB Per User], & Convex Demo
        </h1>
        <div class="mb-16">
          <Show
            when={isAuthenticated()}
            fallback={(
              <Button
                onClick={() => router.navigate({ to: "/sign-in" })}
                variant="sf-compute"
                class="justify-between w-full md:w-auto px-6 py-3"
              >
                <span>Login  //  Sign Up</span>
                <span class="ml-2 opacity-70">◯</span>
              </Button>

            )}
          >
            <Button
              onClick={() => router.navigate({ to: "/dashboard" })}
              variant="sf-compute"
              class="justify-between w-full md:w-auto px-6 py-3"
            >
              <span>Go to Dashboard</span>
              <span class="ml-2 opacity-70">◯</span>
            </Button>
          </Show>
        </div>
      
        <Card>
          <CardHeader>
            <CardTitle>
              Quick Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            This project showcases the following technologies:
            <ul class="list-disc list-inside">
              <li>Cloudflare D1, Pages, Workers, Durable Objects</li>
              <li>Convex</li>
              <li>SolidJS</li>
              <li>Tanstack Router</li>
              <li>Better Auth</li>
            </ul>
          </CardContent>
          <CardFooter>
            <p class="text-sm text-muted-foreground">
              This is a demo of the D1 Better Auth, Durable Objects [DB Per User], & Convex Demo
            </p>
          </CardFooter>
        </Card>
        
        <Footer />
      </div>
    </div>
  );
};

export const Route = createFileRoute('/')({
  component: HomePage,
  loader: async ({ context }) => {
    const { queryClient } = context as RouterContext;
    try {
      // fetchQuery is perfect here: it gets data from the cache if available,
      // fetches if not, but doesn't trigger global loading states or throw errors
      // on failed fetches, which is ideal for a non-blocking auth check.
      const session = await queryClient.fetchQuery(sessionQueryOptions);
      return session;
    } catch {
      // If there's a network or other error, treat as not authenticated.
      return null;
    }
  },
});
