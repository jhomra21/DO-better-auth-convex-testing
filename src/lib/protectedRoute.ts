import { redirect, type RouteLoaderFn } from "@tanstack/solid-router";
import { authClient } from "./authClient";
import type { QueryClient } from "@tanstack/solid-query";
import type { User, Session } from "./useAuth";

// This assumes you have setup your router context to include the queryClient.
// e.g., in your src/index.tsx: new Router({ routeTree, context: { queryClient } })
interface RouterContext {
  queryClient: QueryClient;
}

// Define the shape of the data returned by authClient.getSession()
type SessionData = {
  data: {
    user: User | null;
    session: Session | null;
    authenticated: boolean;
  }
};

// Define the query options that can be used by both the loader and other parts of the app
const sessionQueryOptions = {
  queryKey: ['auth', 'session'],
  // The query function is what `fetchQuery` will execute.
  queryFn: () => authClient.getSession(),
};

/**
 * A loader for protected routes.
 * It ensures the user is authenticated by fetching the session.
 * If the user is not authenticated, it redirects to the sign-in page.
 * It provides the session data to the route component.
 *
 * Usage in a route definition:
 * loader: protectedRouteLoader
 */
export const protectedRouteLoader: RouteLoaderFn = async ({ context, location }) => {
  const { queryClient } = context as { queryClient: QueryClient };

  try {
    // `fetchQuery` will now use the fully-defined query options.
    // This provides the necessary type information and the function to execute.
    const sessionData = await queryClient.fetchQuery(sessionQueryOptions);
    
    const isAuthenticated = !!sessionData?.data?.user;

    if (!isAuthenticated) {
      console.error('Authentication check failed, redirecting to sign-in. Error: User not authenticated');
      throw redirect({
        to: '/sign-in',
        search: {
          redirect: location.href,
        },
      });
    }

    // Return the user/session data on success
    return sessionData.data;
  } catch (error) {
    console.error('Error during authentication check in loader, redirecting.', error);
    throw redirect({
      to: '/sign-in',
      search: {
        redirect: location.href,
      },
    });
  }
};

/**
 * A loader for public-only routes (e.g., sign-in, sign-up).
 * It checks if a user is already authenticated.
 * If so, it redirects them to the dashboard.
 *
 * Usage in a route definition:
 * loader: publicOnlyLoader
 */
export const publicOnlyLoader: RouteLoaderFn = async ({ context }) => {
  const { queryClient } = context as { queryClient: QueryClient };

  // For public routes, we can also ensure the session is loaded,
  // then redirect if the user IS authenticated.
  try {
    const sessionData = await queryClient.fetchQuery(sessionQueryOptions);
    if (sessionData?.data?.user) {
      // User is logged in, redirect to dashboard
      throw redirect({
        to: '/dashboard',
      });
    }
  } catch {
    // Error fetching session can be ignored here, it means user is not logged in.
  }
  
  // Return null because no data is needed for public routes
  return null;
}; 