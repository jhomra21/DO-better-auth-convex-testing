import { useAuthContext } from './AuthProvider';
import { useRouter } from '@tanstack/solid-router';
import { createEffect, type Accessor, createSignal, onMount } from 'solid-js';

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
  
  // Initial check on mount
  onMount(() => {
    
    // Set a timeout to ensure guard check completes even if auth is never ready
    setTimeout(() => {
      if (!guardChecked()) {
        performGuardCheck();
      }
    }, 2000);
  });
  
  // Function to perform the actual guard check
  const performGuardCheck = () => {
    const isAuth = auth.isAuthenticated();
    
    if (requireAuth && !isAuth) {
      try {
        router.navigate({ to: signInRoute, replace: true });
      } catch (e) {
        console.error("Router navigation failed in auth guard, using direct navigation", e);
        window.location.href = signInRoute;
      }
    } else if (!requireAuth && isAuth) {
      try {
        router.navigate({ to: homeRoute, replace: true });
      } catch (e) {
        console.error("Router navigation failed in auth guard, using direct navigation", e);
        window.location.href = homeRoute;
      }
    }
    
    setGuardChecked(true);
  };
  
  createEffect(() => {
    // Only perform redirects when auth is ready and not loading
    if (auth.authReady() && !auth.isLoading()) {
      performGuardCheck();
    } else if (!auth.authReady()) {
    }
  });
  
  // Create an effect to check auth state changes
  createEffect(() => {
    // If auth state changes after initial check, perform guard check again
    if (guardChecked() && auth.authReady()) {
      performGuardCheck();
    }
  });
  
  return {
    isLoading: auth.isLoading,
    isAuthenticated: auth.isAuthenticated,
    authReady: auth.authReady,
  };
}
