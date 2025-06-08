import { createMemo } from 'solid-js';
import { useQueryClient } from '@tanstack/solid-query';
import { authClient, googleLogin } from './authClient';

// Define types for user and session to match what better-auth/solid provides.
// This makes our frontend types consistent with the auth library's output.
export type User = {
  id: string;
  email: string;
  name?: string;
  emailVerified?: boolean;
  image?: string;
  createdAt?: Date; // Use Date object instead of number
  updatedAt?: Date; // Add updatedAt with Date object
};

export type Session = {
  id: string;
  userId: string;   // Use camelCase to match library
  expiresAt: Date;  // Use camelCase and Date object
  createdAt?: Date; // Use camelCase and Date object
  updatedAt?: Date; // Use camelCase and Date object
  token?: string;
  ipAddress?: string;
  userAgent?: string;
};

export type AuthResult = {
  error: { message: string, code: string | undefined } | null;
};

export interface UseAuthReturn {
  isAuthenticated: () => boolean;
  isLoading: () => boolean;
  user: () => User | null;
  session: () => Session | null;
  login: (email: string, password: string) => Promise<AuthResult>;
  signup: (email: string, password: string, name: string) => Promise<AuthResult>;
  logout: () => Promise<void>;
  loginWithGoogle: (callbackURL?: string) => Promise<AuthResult>;
  authReady: () => boolean;
}

// This is the new, simplified useAuth hook.
export function useAuth(): UseAuthReturn {
  const queryClient = useQueryClient();
  // `useSession` returns a reactive accessor. Call it to get the query state.
  // Query options like `refetchOnWindowFocus` are now configured in `authClient.ts`.
  const sessionQuery = authClient.useSession();

  // Authentication is determined by the presence of session data.
  const isAuthenticated = createMemo(() => !!sessionQuery()?.data);
  const isLoading = createMemo(() => sessionQuery()?.isPending);
  const user = createMemo(() => {
    const userData = sessionQuery()?.data?.user;
    if (!userData) return null;
    // The user object from the server may have date strings, but our app wants Date objects.
    // We create a new object to avoid mutating the cached query data directly.
    return {
      ...userData,
      createdAt: userData.createdAt ? new Date(userData.createdAt) : undefined,
      updatedAt: userData.updatedAt ? new Date(userData.updatedAt) : undefined,
    } as User;
  });

  const session = createMemo(() => {
    const sessionData = sessionQuery()?.data?.session;
    if (!sessionData) return null;
    // The session object also has date strings that need to be converted.
    return {
      ...sessionData,
      expiresAt: new Date(sessionData.expiresAt),
      createdAt: sessionData.createdAt ? new Date(sessionData.createdAt) : undefined,
      updatedAt: sessionData.updatedAt ? new Date(sessionData.updatedAt) : undefined,
    } as Session;
  });
  
  // The auth flow is ready when the initial fetch/refetch is no longer pending.
  const authReady = createMemo(() => !sessionQuery()?.isPending && !sessionQuery()?.isRefetching);

  const refetchSession = () => queryClient.invalidateQueries({ queryKey: ['auth', 'session'] });

  // Login function now uses authClient and refetches session on success.
  const login = async (email: string, password: string): Promise<AuthResult> => {
    const { error } = await authClient.signIn.email({ email, password });
    if (error) {
      return { error: { message: error.message || '', code: error.code || undefined } };
    }
    await refetchSession();
    return { error: null };
  };

  // Signup function now uses authClient and refetches session on success.
  const signup = async (email: string, password: string, name: string): Promise<AuthResult> => {
    const { error } = await authClient.signUp.email({ email, password, name });
    if (error) {
      return { error: { message: error.message || '', code: error.code || undefined } };
    }
    await refetchSession();
    return { error: null };
  };

  // Logout function now uses authClient and refetches session.
  const logout = async (): Promise<void> => {
    await authClient.signOut();
    await refetchSession();
  };

  // Google login function now uses the helper from authClient.
  const loginWithGoogle = async (callbackURL?: string): Promise<AuthResult> => {
    const { error } = await googleLogin(callbackURL);
    if (error) {
        return { error: { message: error.message || '', code: error.code || undefined } };
    }
    // No need to refetch here, the page will reload after OAuth redirect.
    return { error: null };
  };
  
  return {
    isAuthenticated,
    isLoading,
    user,
    session,
    login,
    signup,
    logout,
    loginWithGoogle,
    authReady,
  };
} 