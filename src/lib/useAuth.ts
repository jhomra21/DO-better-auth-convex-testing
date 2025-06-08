import { createSignal, createEffect, createResource, onMount, onCleanup } from 'solid-js';
import { 
  enhancedLogin, 
  enhancedSignup, 
  enhancedLogout, 
  getSession, 
  hasAuthToken,
  googleLogin,
  updateGlobalAuthState
} from './authClient';
import type { SessionResponse } from './api';
import { setLastAuthSession } from './protectedRoute'; // Import the new function
// Define type for user to match Better Auth structure
export type User = {
  id: string;
  email: string;
  name?: string;
  emailVerified?: boolean;
  image?: string;
  createdAt?: number;
  // Add any other fields from your Better Auth user object
};

// Reuse the session type from SessionResponse in api.ts
export type Session = SessionResponse['session'] & {
  // Add any additional properties needed for the frontend
};

export type AuthState = {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  session: Session | null;
};

// Define the type for the authentication result
export type AuthResult = {
  error: { message: string } | null;
};

// Define the type for our hook return value
export interface UseAuthReturn {
  isAuthenticated: () => boolean;
  isLoading: () => boolean;
  user: () => User | null;
  session: () => Session | null;
  login: (email: string, password: string) => Promise<AuthResult>;
  signup: (email: string, password: string, name: string) => Promise<AuthResult>;
  logout: () => Promise<void>;
  loginWithGoogle: (callbackURL?: string) => Promise<AuthResult>;
  refreshSession: () => Promise<void>;
  authReady: () => boolean;
  setManualSessionData: (data: { user: User, session: any }) => void;
}

export function useAuth(): UseAuthReturn {
  // Create signals for auth state
  const [authState, setAuthState] = createSignal<AuthState>({
    isAuthenticated: hasAuthToken(), // Initialize based on token presence
    isLoading: true,
    user: null,
    session: null,
  });

  // Track if auth is ready (initialization complete)
  const [authReady, setAuthReady] = createSignal(false);

  // Create a signal to track the token
  const [currentToken, setCurrentToken] = createSignal(localStorage.getItem('bearer_token') || '');

  // Create a resource that fetches the session
  const [sessionData, { refetch: refetchSession }] = createResource(async () => {
    try {
      // Fetch the session using our custom function
      const result = await getSession();
      
      if (result && result.authenticated) {
        // Use the session data directly from the API response
        const normalizedSession: Session = {
          id: result.session?.id || '',
          user_id: result.session?.user_id || '',
          expires_at: result.session?.expires_at || 0,
          token: result.session?.token || '',
          created_at: result.session?.created_at,
          updated_at: result.session?.updated_at,
          ip_address: result.session?.ip_address,
          user_agent: result.session?.user_agent
        };
        
        setAuthState({
          isAuthenticated: true,
          isLoading: false,
          user: result.user || null,
          session: normalizedSession,
        });
        return result;
      } else {
        setAuthState({
          isAuthenticated: false,
          isLoading: false,
          user: null,
          session: null,
        });
        return null;
      }
    } catch (error) {
      console.error("Session fetch error:", error);
      setAuthState({
        isAuthenticated: false,
        isLoading: false,
        user: null,
        session: null,
      });
      return null;
    } finally {
      setAuthReady(true);
    }
  });

  // Combined effect for session data and token tracking
  createEffect(() => {
    // 1. Update loading state based on session data
    const data = sessionData();
    if (data !== undefined) {
      setAuthState(prev => ({ ...prev, isLoading: false }));
    }

    // 2. Track token changes and refresh session when needed
    const token = localStorage.getItem('bearer_token') || '';
    if (token !== currentToken()) {
      setCurrentToken(token);
      refetchSession();
    }
  });

  // Initialize auth and set up event listeners
  onMount(() => {
    // Check URL for token and refresh session if needed
    const url = new URL(window.location.href);
    if (url.searchParams.has('token')) {
      // Force immediate session refresh if token is present in URL
      refetchSession();
    }
    
    // Set a timeout to ensure initialization completes even if there are issues
    const timeoutId = setTimeout(() => {
      if (!authReady()) {
        setAuthReady(true);
        setAuthState(prev => ({ ...prev, isLoading: false }));
      }
    }, 2000);

    // Set up a listener for storage events (for multi-tab support)
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'bearer_token') {
        const token = localStorage.getItem('bearer_token') || '';
        setCurrentToken(token);
        refetchSession();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    
    // Clean up
    onCleanup(() => {
      clearTimeout(timeoutId);
      window.removeEventListener('storage', handleStorageChange);
    });
  });

  // Login function
  const login = async (email: string, password: string): Promise<AuthResult> => {
    setAuthState(prev => ({ ...prev, isLoading: true }));
    
    try {
      const result = await enhancedLogin(email, password);
      
      if (!result.error) {
        // Check if the result includes user and session data
        if (result.user && result.session && result.authenticated) {
          // Update auth state directly with the returned data
          setAuthState({
            isAuthenticated: true,
            isLoading: false,
            user: result.user,
            session: result.session
          });
          
          // Update global auth state via the utility function
          updateGlobalAuthState(true, result.user);
          
          // Store session for route protection
          setLastAuthSession({
            session: result.session,
            user: result.user,
            authenticated: true
          });
          
          // Update query cache directly instead of refetching
          window.__QUERY_CLIENT?.setQueryData(['auth', 'session'], {
            authenticated: true,
            user: result.user,
            session: result.session
          });
        } else {
          // Fallback to previous behavior if session data not included
          window.__QUERY_CLIENT?.removeQueries({ queryKey: ['auth', 'session'] });
          await refreshSession();
        }
        
        return { error: null };
      } else {
        setAuthState(prev => ({ ...prev, isLoading: false }));
        return result;
      }
    } catch (error) {
      setAuthState(prev => ({ ...prev, isLoading: false }));
      return { 
        error: { 
          message: error instanceof Error ? error.message : "Unknown error during login" 
        } 
      };
    }
  };

  // Signup function
  const signup = async (email: string, password: string, name: string): Promise<AuthResult> => {
    setAuthState(prev => ({ ...prev, isLoading: true }));
    
    try {
      const result = await enhancedSignup(email, password, name);
      
      if (!result.error) {
        // Check if the result includes user and session data
        if (result.user && result.session && result.authenticated) {
          // Update auth state directly with the returned data
          setAuthState({
            isAuthenticated: true,
            isLoading: false,
            user: result.user,
            session: result.session
          });
          
          // Update global auth state via the utility function
          updateGlobalAuthState(true, result.user);
          
          // Store session for route protection
          setLastAuthSession({
            session: result.session,
            user: result.user,
            authenticated: true
          });
          
          // Update query cache directly instead of refetching
          window.__QUERY_CLIENT?.setQueryData(['auth', 'session'], {
            authenticated: true,
            user: result.user,
            session: result.session
          });
        } else {
          // Fallback to previous behavior if session data not included
          window.__QUERY_CLIENT?.removeQueries({ queryKey: ['auth', 'session'] });
          await refreshSession();
        }
        
        return { error: null };
      } else {
        setAuthState(prev => ({ ...prev, isLoading: false }));
        return result;
      }
    } catch (error) {
      setAuthState(prev => ({ ...prev, isLoading: false }));
      return { 
        error: { 
          message: error instanceof Error ? error.message : "Unknown error during signup" 
        }
      };
    }
  };

  // Logout function
  const logout = async (): Promise<void> => {
    setAuthState(prev => ({ ...prev, isLoading: true }));
    try {
      await enhancedLogout();
      
      // Clear the session cache
      window.__QUERY_CLIENT?.removeQueries({ queryKey: ['auth', 'session'] });
      
      // Update global auth state
      updateGlobalAuthState(false, null);
      
      setAuthState({
        isAuthenticated: false,
        isLoading: false,
        user: null,
        session: null,
      });
      
      setAuthReady(true);
    } catch (error) {
      console.error("Logout error:", error);
      // Still update state even if there was an error
      setAuthState({
        isAuthenticated: false,
        isLoading: false,
        user: null,
        session: null,
      });
    }
  };

  // Google login function
  const loginWithGoogle = async (callbackURL?: string): Promise<AuthResult> => {
    setAuthState(prev => ({ ...prev, isLoading: true }));
    
    try {
      // Note: We can't immediately get session data after Google login
      // as it involves a redirect flow, but we can optimize the return handling
      const result = await googleLogin(callbackURL);
      
      if (!result.error) {
        // Google auth is special because it redirects to the provider
        // Just set loading to false, the actual session will be checked
        // when the user returns from the OAuth provider
        setAuthState(prev => ({ ...prev, isLoading: false }));
        
        // No need to update cache or invalidate queries here - it will be
        // handled by initAuth and handleTokenFromUrl after redirect
        return { error: null };
      } else {
        setAuthState(prev => ({ ...prev, isLoading: false }));
        return result;
      }
    } catch (error) {
      setAuthState(prev => ({ ...prev, isLoading: false }));
      return { 
        error: { 
          message: error instanceof Error ? error.message : "Unknown error during Google login" 
        } 
      };
    }
  };

  // Function to refresh the session
  const refreshSession = async (): Promise<void> => {
    // Invalidate the session cache to force a fresh fetch
    window.__QUERY_CLIENT?.invalidateQueries({ queryKey: ['auth', 'session'] });
    await refetchSession();
  };

  // Function to manually set session data (useful for immediate UI updates)
  const setManualSessionData = (data: { user: User, session: any }) => {
    setAuthState({
      isAuthenticated: true,
      isLoading: false,
      user: data.user,
      session: data.session,
    });
  };

  // Return the auth state and functions
  return {
    isAuthenticated: () => authState().isAuthenticated,
    isLoading: () => authState().isLoading,
    user: () => authState().user,
    session: () => authState().session,
    login,
    signup,
    logout,
    loginWithGoogle,
    refreshSession,
    authReady,
    setManualSessionData,
  };
} 