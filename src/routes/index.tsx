import { createFileRoute, Link } from '@tanstack/solid-router';
import type { Component } from 'solid-js';
import { Show, createMemo } from 'solid-js';
import { GlobalAuth } from '~/lib/AuthProvider';
import { publicOnlyLoader } from '~/lib/protectedRoute';

const HomePage: Component = () => {
  const isAuthenticated = createMemo(() => GlobalAuth.isAuthenticated());
  
  return (
    <div class="p-6 min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 text-white">
      <div class="text-center space-y-8">
        <h1 class="text-6xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-sky-400 to-blue-500">
          Welcome!
        </h1>
        <p class="text-xl text-slate-300 max-w-md mx-auto">
          This is a simple landing page. Navigate to your desired section.
        </p>
        <div class="flex flex-col sm:flex-row gap-4 justify-center pt-4">
          <Show
            when={isAuthenticated()}
            fallback={(
              <>
                <Link
                  to="/sign-in"
                  class="px-8 py-3 font-semibold rounded-lg bg-sky-500 hover:bg-sky-600 transition-colors duration-200 text-white shadow-lg hover:shadow-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-opacity-75"
                >
                  Sign In
                </Link>
                <Link
                  to="/sign-up"
                  class="px-8 py-3 font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 transition-colors duration-200 text-white shadow-lg hover:shadow-blue-600/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75"
                >
                  Sign Up
                </Link>
              </>
            )}
          >
            <Link
              to="/dashboard"
              class="px-8 py-3 font-semibold rounded-lg bg-green-500 hover:bg-green-600 transition-colors duration-200 text-white shadow-lg hover:shadow-green-500/50 focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-opacity-75"
            >
              Go to Dashboard
            </Link>
          </Show>
        </div>
      </div>
    </div>
  );
};

export const Route = createFileRoute('/')({
  component: HomePage,
  // Allow authenticated users to access home page by setting skipRedirect to true
  beforeLoad: () => publicOnlyLoader({ skipRedirect: true }),
});
