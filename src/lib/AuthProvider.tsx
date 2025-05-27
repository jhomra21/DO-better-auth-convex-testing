import { createContext, useContext, type JSX, type Component, createEffect, createSignal, Show } from 'solid-js';
import { useAuth, type UseAuthReturn } from '~/lib/useAuth'; 

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
  
  // Set initialized when auth is ready
  createEffect(() => {
    if (auth.authReady()) {
      setInitialized(true);
    }
  });
  
  // Fallback initialization after timeout
  setTimeout(() => {
    if (!initialized()) {
      setInitialized(true);
    }
  }, 3000);

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