import { createSignal, createEffect, createResource, onMount } from 'solid-js';
import { 
  enhancedLogin, 
  enhancedSignup, 
  enhancedLogout, 
  getSession, 
  hasAuthToken,
  googleLogin
} from './authClient';
import type { SessionResponse } from './api';

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

  // Create an effect to update the loading state based on session resource
  createEffect(() => {
    const data = sessionData();
    if (data !== undefined) {
      setAuthState(prev => ({ ...prev, isLoading: false }));
    }
  });

  // Initialize auth on mount
  onMount(() => {
    // Check URL for token and refresh session if needed
    const url = new URL(window.location.href);
    if (url.searchParams.has('token')) {
      // Force immediate session refresh if token is present in URL
      refetchSession();
    }
    
    // Set a timeout to ensure initialization completes even if there are issues
    setTimeout(() => {
      if (!authReady()) {
        setAuthReady(true);
        setAuthState(prev => ({ ...prev, isLoading: false }));
      }
    }, 2000);
  });

  // Create a signal to track the token
  const [currentToken, setCurrentToken] = createSignal(localStorage.getItem('bearer_token') || '');

  // Watch for token changes in localStorage
  createEffect(() => {
    const checkToken = () => {
      const token = localStorage.getItem('bearer_token') || '';
      if (token !== currentToken()) {
        setCurrentToken(token);
        refetchSession();
      }
    };

    // Check initially
    checkToken();

    // Set up a listener for storage events
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'bearer_token') {
        checkToken();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    
    // Clean up
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  });

  // Login function
  const login = async (email: string, password: string): Promise<AuthResult> => {
    setAuthState(prev => ({ ...prev, isLoading: true }));
    
    try {
      // Use our enhanced login function
      const result = await enhancedLogin(email, password);
      
      if (!result.error) {
        // If login was successful, refresh the session
        await refreshSession();
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
      // Use our enhanced signup function
      const result = await enhancedSignup(email, password, name);
      
      if (!result.error) {
        // If signup was successful, refresh the session
        await refreshSession();
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
      // Use our googleLogin function
      const result = await googleLogin(callbackURL);
      
      // Google login redirects the user, so we won't be refreshing the session here
      // The session will be loaded when the user returns to the site
      if (!result.error) {
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