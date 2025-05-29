import { createFileRoute } from '@tanstack/solid-router';
import type { Component } from 'solid-js';
import { Show, createMemo } from 'solid-js';
import { GlobalAuth } from '~/lib/AuthProvider';
import { publicOnlyLoader } from '~/lib/protectedRoute';
import { Button } from '~/components/ui/button';
import { useRouter } from '@tanstack/solid-router';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '~/components/ui/card';
import Footer from '~/components/Footer';

const HomePage: Component = () => {
  const isAuthenticated = createMemo(() => GlobalAuth.isAuthenticated());
  const router = useRouter();

  return (
    <div class="p-8 pt-16 min-h-screen flex flex-col bg-gradient-to-br from-stone-50 via-stone-100 to-stone-400/60 text-gray-900">
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
  // Allow authenticated users to access home page by setting skipRedirect to true
  beforeLoad: () => publicOnlyLoader({ skipRedirect: true }),
});
