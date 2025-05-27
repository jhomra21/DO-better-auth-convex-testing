import { createAuthClient } from "better-auth/client";
import { getSession as getSessionFromApi } from './api';
import { getApiUrl } from './utils';

// Use getApiUrl() directly instead of storing in a variable
// to avoid circular dependency issues

// Function to save the token with logging
function saveToken(token: string | null) {
    if (token) {
        localStorage.setItem("bearer_token", token);
    } 
}

// Function to get the token with logging
function getToken(): string {
    const token = localStorage.getItem("bearer_token");
    return token || "";
}

// Create auth client with cross-domain support
export const authClient = createAuthClient({
    baseURL: `${getApiUrl()}/api/auth`, // Ensure this matches your backend auth route base
    fetchOptions: {
        // Essential for cross-domain cookies
        credentials: 'include',
        onSuccess: (ctx) => {
            // Try multiple header variations (case sensitivity can matter)
            const authToken = 
                ctx.response.headers.get("set-auth-token") || 
                ctx.response.headers.get("Set-Auth-Token") ||
                ctx.response.headers.get("SET-AUTH-TOKEN");
            
            if (authToken) {
                saveToken(authToken);
            } else {
                // Check for token in response body as fallback
                ctx.response.clone().json().then(data => {
                    // Add type assertion to avoid property access errors
                    const responseData = data as { token?: string };
                    if (responseData && responseData.token) {
                        saveToken(responseData.token);
                    }
                }).catch(err => {
                    console.error("Could not parse response as JSON:", err);
                });
            }
        },
        auth: {
            type: "Bearer",
            token: getToken
        },
    }
});

// Create a custom fetch function that handles the token and includes credentials
export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
    // Add token to request if available
    const token = getToken();
    if (token) {
        options.headers = {
            ...options.headers,
            'Authorization': `Bearer ${token}`
        };
    }
    
    // Always include credentials for cross-domain cookies
    options.credentials = 'include';
    
    const response = await fetch(url, options);
    
    // Check for token in various header formats
    const authToken = 
        response.headers.get("set-auth-token") || 
        response.headers.get("Set-Auth-Token");
    
    if (authToken) {
        saveToken(authToken);
    }
    
    return response;
}

// Export a function to check if we have a token (for initial auth state)
export function hasAuthToken(): boolean {
    return !!localStorage.getItem("bearer_token");
}

// Export a function to clear the token
export function clearAuthToken(): void {
    localStorage.removeItem("bearer_token");
}

// Export a function to manually set a token
export function setAuthToken(token: string): void {
    saveToken(token);
}

// Enhanced login function that ensures credentials are included
export async function enhancedLogin(email: string, password: string): Promise<any> {
    try {
        const response = await fetch(`${getApiUrl()}/api/auth/sign-in/email`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password }),
            credentials: 'include' // Critical for cross-domain cookies
        });
        
        // Check for token header
        const authToken = response.headers.get("set-auth-token") || 
                          response.headers.get("Set-Auth-Token");
        
        if (authToken) {
            saveToken(authToken);
            return { error: null };
        } else {
            // Try to parse response body for token
            const data = await response.json();
            
            // Add type assertion
            const responseData = data as { token?: string, error?: any };
            if (responseData && responseData.token) {
                saveToken(responseData.token);
                return { error: null };
            } else if (responseData && responseData.error) {
                return { error: responseData.error };
            } else {
                return { error: { message: "Login failed - no token received" } };
            }
        }
    } catch (error) {
        console.error("Enhanced login error:", error);
        return { error: { message: error instanceof Error ? error.message : "Unknown error during login" } };
    }
}

// Enhanced signup function with cross-domain support
export async function enhancedSignup(email: string, password: string, name: string): Promise<any> {
    try {
        const response = await fetch(`${getApiUrl()}/api/auth/sign-up/email`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password, name }),
            credentials: 'include' // Critical for cross-domain cookies
        });
        
        // Check for token header
        const authToken = response.headers.get("set-auth-token") || 
                          response.headers.get("Set-Auth-Token");
        
        if (authToken) {
            saveToken(authToken);
            return { error: null };
        } else {
            // Try to parse response body
            const data = await response.json();
            
            // Check for token in response body
            const responseData = data as { token?: string, error?: any };
            if (responseData && responseData.token) {
                saveToken(responseData.token);
                return { error: null };
            } else if (responseData && responseData.error) {
                return { error: responseData.error };
            } else {
                // If signup was successful but no token, try logging in
                return await enhancedLogin(email, password);
            }
        }
    } catch (error) {
        console.error("Enhanced signup error:", error);
        return { error: { message: error instanceof Error ? error.message : "Unknown error during signup" } };
    }
}

// Enhanced logout function
export async function enhancedLogout(): Promise<any> {
    try {        
        // Get the current token
        const token = localStorage.getItem('bearer_token');
        
        if (!token) {
            // If no token, just clear local state
            clearAuthToken();
            return { success: true };
        }
        
        // First try to directly delete the session from the database
        try {
            const apiUrl = getApiUrl();
            const response = await fetch(`${apiUrl}/api/protected/sessions/current`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                credentials: 'include'
            });
            
            if (response.ok) {
                // If direct session deletion was successful, clear local state
                clearAuthToken();
                return { success: true };
            }
        } catch (directDeleteError) {
            // If direct deletion fails, continue with standard sign-out
            console.error('Direct session deletion failed, trying standard sign-out');
        }
        
        // Use Better Auth's standard signOut method as fallback
        try {
            await authClient.signOut({
                fetchOptions: {
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    }
                }
            });
        } catch (authError) {
            // Even if Better Auth sign-out fails, we should still clear local state
            console.error('Better Auth sign-out error, clearing local state anyway');
        }
        
        // Always clear the local token regardless of API success
        clearAuthToken();
        return { success: true };
    } catch (error) {
        // Clear token even if there's an error
        clearAuthToken();
        return { error };
    }
}

// Google login function
export async function googleLogin(callbackURL?: string): Promise<any> {
    try {
        // Frontend URL to redirect after authentication
        const frontendRedirect = callbackURL || '/';
       
        
        // Call Better Auth's social sign-in with Google
        await authClient.signIn.social({
            provider: "google",
            callbackURL: frontendRedirect,
            // This is a workaround to ensure the callback works properly
            // The actual OAuth callback goes to the API server
            errorCallbackURL: frontendRedirect
        });
        
        return { error: null };
    } catch (error) {
        console.error("Google login error:", error);
        return { 
            error: { 
                message: error instanceof Error ? error.message : "Unknown error during Google login" 
            } 
        };
    }
}

// Update to use the new implementation
export async function getSession(): Promise<any> {
    try {
        // Use our new implementation that includes token in Authorization header
        return await getSessionFromApi();
    } catch (error) {
        console.error("Get session error:", error);
        return { authenticated: false };
    }
}

// Function to handle token from URL query params (for OAuth callback)
export function handleTokenFromUrl(): void {
    try {
        const url = new URL(window.location.href);
        const token = url.searchParams.get('token');
        
        if (token) {
            saveToken(token);
            
            // Remove the token from the URL for security
            url.searchParams.delete('token');
            window.history.replaceState({}, document.title, url.toString());
            
            // Force a page reload to ensure the app recognizes the new auth state
            // This is a simple but effective way to ensure the app picks up the new token
            // setTimeout(() => {
            //     window.location.reload();
            // }, 100);
        }
    } catch (error) {
        console.error('Error handling token from URL:', error);
    }
}

// Initialize function to check for token in URL
export function initAuth(): void {
    // Check if there's a token in the URL
    handleTokenFromUrl();
} 