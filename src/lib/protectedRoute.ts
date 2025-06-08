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

const sessionQueryOptions = {
  queryKey: ["auth", "session"],
  // We don't want to retry on failure for auth checks, as it can cause loops
  // or unwanted redirects. If it fails, it fails.
  retry: 0,
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
  const { queryClient } = context as RouterContext;

  try {
    const session = await queryClient.ensureQueryData(sessionQueryOptions);
    if (!session?.data?.user) {
      throw new Error("User not authenticated");
    }
    return session.data;
  } catch (error) {
    console.error("Authentication check failed, redirecting to sign-in.", error);
    throw redirect({
      to: "/sign-in",
      search: {
        redirect: location.pathname + location.search,
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
  const { queryClient } = context as RouterContext;

  try {
    // Use fetchQuery to check for a session without triggering loading indicators.
    // It checks the cache first, then fetches if stale.
    const session = await queryClient.fetchQuery(sessionQueryOptions);
    if (session?.data?.user) {
      throw redirect({
        to: "/dashboard",
      });
    }
  } catch (error) {
    // Error indicates no active session, which is expected on public routes.
    // We can safely ignore it and allow rendering the route.
  }

  return {};
}; 