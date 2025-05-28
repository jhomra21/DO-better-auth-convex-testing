import { createFileRoute } from '@tanstack/solid-router';
import type { Component } from 'solid-js';
import { Show, createMemo } from 'solid-js';
import { GlobalAuth } from '~/lib/AuthProvider';
import { publicOnlyLoader } from '~/lib/protectedRoute';
import { Button } from '~/components/ui/button';
import { useRouter } from '@tanstack/solid-router';
const HomePage: Component = () => {
  const isAuthenticated = createMemo(() => GlobalAuth.isAuthenticated());
  const router = useRouter();

  return (
    <div class="p-8 pt-16 min-h-screen flex flex-col bg-white text-gray-900">
      <div class="max-w-2xl mx-auto w-full">
        <h1 class="text-3xl font-bold mb-6">
          Better Auth & Convex Demo
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

        <section class="mb-16">
          <h2 class="text-2xl font-bold mb-4">Available Capacity</h2>
          <div class="flex items-center gap-2 text-gray-700 mb-2">
            <div class="w-3 h-3 rounded-full bg-green-500"></div>
            <span class="font-mono">$0.99/project/day</span>
            <span class="ml-2 text-gray-500">→</span>
            <span class="ml-2 text-gray-500">Next available slot today</span>
          </div>
          <div class="mt-4 h-40 bg-gray-100 rounded-lg"></div>
        </section>

        <section>
          <h2 class="text-2xl font-bold mb-4">Looking for more auth options?</h2>
          <p class="text-gray-700 mb-4">
            We offer competitive pricing for large reservations of auth providers. Contact sales and let us know what you're looking for.
          </p>
          <Button
            variant="sf-compute"
            class="justify-between px-5 py-2"
          >
            Contact Sales
            <span class="ml-2 opacity-70">◯</span>
          </Button>
        </section>
      </div>
      <div class="mt-10 text-xs text-gray-500 text-center">
        <p>*Prices are from the private beta and may change</p>
      </div>
    </div>
  );
};

export const Route = createFileRoute('/')({
  component: HomePage,
  // Allow authenticated users to access home page by setting skipRedirect to true
  beforeLoad: () => publicOnlyLoader({ skipRedirect: true }),
});
