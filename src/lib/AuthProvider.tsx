import { createContext, useContext, type JSX, type Component, Show } from 'solid-js';
import { useAuth, type UseAuthReturn } from '~/lib/useAuth';

// The GlobalAuth object and its attachment to the window are no longer needed
// as the new useAuth hook provides a more direct and reliable way to manage state.

// Define the type for the auth context, which remains the same.
export type AuthContextType = UseAuthReturn;

// Create an auth context.
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Export a hook to use the auth context.
export const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
};

// The AuthProvider component props.
interface AuthProviderProps {
  children: JSX.Element;
}

// The AuthProvider component is now much simpler.
export const AuthProvider: Component<AuthProviderProps> = (props) => {
  // The useAuth hook now efficiently manages all state via better-auth's `useSession`.
  const auth = useAuth();
  
  // The complex `createEffect` and `onMount` logic for syncing with GlobalAuth
  // and handling timeouts are no longer necessary. The `authReady` signal
  // from our new hook is sufficient to know when to render the children.

  return (
    <AuthContext.Provider value={auth}>
      <Show 
        when={auth.authReady()} 
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