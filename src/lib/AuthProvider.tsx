import { createContext, useContext, type JSX, type Component, createEffect, createSignal, Show, onMount, onCleanup } from 'solid-js';
import { useAuth, type UseAuthReturn } from '~/lib/useAuth'; 
import { createRoot } from 'solid-js';

// Create a global auth state that can be accessed across the app
// This is the key to solving the navigation issue
export const GlobalAuth = createRoot(() => {
  const [isAuthenticated, setIsAuthenticated] = createSignal(false);
  const [user, setUser] = createSignal<any>(null);
  
  return {
    isAuthenticated,
    setIsAuthenticated,
    user,
    setUser
  };
});

// Expose GlobalAuth to window for access from other modules without circular dependencies
if (typeof window !== 'undefined') {
  (window as any).__GLOBAL_AUTH = GlobalAuth;
}

// Update type declaration
declare global {
  interface Window {
    __GLOBAL_AUTH: typeof GlobalAuth;
    __QUERY_CLIENT: any;
  }
}

// Define the type for the auth context
export type AuthContextType = UseAuthReturn;

// Create an auth context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Export a hook to use the auth context
export const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
};

// The AuthProvider component props
interface AuthProviderProps {
  children: JSX.Element;
}

// The AuthProvider component
export const AuthProvider: Component<AuthProviderProps> = (props) => {
  const [initialized, setInitialized] = createSignal(false);  
  const auth = useAuth(); // This hook will provide all auth state and methods
  
  // Combine auth state sync and initialization in a single effect
  createEffect(() => {
    // Access these reactive values to create proper dependencies
    const isAuthReady = auth.authReady();
    const isAuthenticated = auth.isAuthenticated();
    const userData = auth.user();
    
    // Update global auth state when local auth state changes
    GlobalAuth.setIsAuthenticated(isAuthenticated);
    GlobalAuth.setUser(userData);
    
    // Set initialized when auth is ready
    if (isAuthReady) {
      setInitialized(true);
    }
  });
  
  // Setup fallback initialization timer with proper cleanup
  onMount(() => {
    const timeoutId = setTimeout(() => {
      if (!initialized()) {
        console.log('Auth initialization timed out, forcing initialized state');
        setInitialized(true);
      }
    }, 3000);
    
    // Clean up timeout when component unmounts
    onCleanup(() => clearTimeout(timeoutId));
  });

  return (
    <AuthContext.Provider value={auth}>
      <Show 
        when={initialized()} 
        fallback={
          <div class="flex items-center justify-center h-screen">
            <div class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
          </div>
        }
      >
        {props.children}
      </Show>
    </AuthContext.Provider>
  );
}; 