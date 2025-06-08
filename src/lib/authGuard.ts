import { useAuthContext } from './AuthProvider';
import { GlobalAuth } from './AuthProvider';
import { useRouter } from '@tanstack/solid-router';
import { createEffect, type Accessor, createSignal, onMount, createMemo } from 'solid-js';

interface UseAuthGuardOptions {
  requireAuth?: boolean; 
  signInRoute?: string;  
  homeRoute?: string;    
}

interface UseAuthGuardReturn {
  isLoading: Accessor<boolean>;
  isAuthenticated: Accessor<boolean>;
  authReady: Accessor<boolean>;
}

export function useAuthGuard({
  requireAuth = true,
  signInRoute = '/sign-in',
  homeRoute = '/',
}: UseAuthGuardOptions = {}): UseAuthGuardReturn {
  const auth = useAuthContext();
  const router = useRouter();
  const [guardChecked, setGuardChecked] = createSignal(false);
  
  // Combine authentication states from both global and context
  const isAuth = createMemo(() => GlobalAuth.isAuthenticated() || auth.isAuthenticated());
  
  // Handle navigation based on auth state
  const navigateBasedOnAuth = () => {
    if (requireAuth && !isAuth()) {
      try {
        router.navigate({ to: signInRoute, replace: true });
      } catch (e) {
        console.error("Router navigation failed in auth guard, using direct navigation", e);
        window.location.href = signInRoute;
      }
    } else if (!requireAuth && isAuth()) {
      try {
        router.navigate({ to: homeRoute, replace: true });
      } catch (e) {
        console.error("Router navigation failed in auth guard, using direct navigation", e);
        window.location.href = homeRoute;
      }
    }
    
    setGuardChecked(true);
  };
  
  // Initial check on mount - use global auth state for immediate check
  onMount(() => {
    // Perform immediate check using global auth state if available
    if ((requireAuth && !isAuth()) || (!requireAuth && isAuth())) {
      navigateBasedOnAuth();
    } else {
      // Set a timeout to ensure guard check completes even if auth is never ready
      setTimeout(() => {
        if (!guardChecked()) {
          navigateBasedOnAuth();
        }
      }, 2000);
    }
  });
  
  // Single unified effect that reacts to auth state changes
  createEffect(() => {
    // This effect depends on:
    const ready = auth.authReady();
    const loading = auth.isLoading();
    
    // Only perform redirects when auth is ready and not loading
    if (ready && !loading && !guardChecked()) {
      navigateBasedOnAuth();
    } else if (ready && !loading && guardChecked()) {
      // If auth state changes after initial check, check again
      navigateBasedOnAuth();
    }
  });
  
  return {
    isLoading: auth.isLoading,
    isAuthenticated: isAuth,
    authReady: auth.authReady,
  };
}
