import { API_URL, apiFetch } from './authClient'; // Use the same API_URL base and fetch function

// Base API client for authenticated requests to your custom backend endpoints
export const apiClient = {
  async fetch<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
    // Initialize Headers object. options.headers can be HeadersInit.
    const requestHeaders = new Headers(options.headers);

    // Set Content-Type if not already set, common for POST/PUT with JSON body
    if (!requestHeaders.has('Content-Type') && options.body) {
        requestHeaders.set('Content-Type', 'application/json');
    }
    
    // API_URL from authClient is the base URL of the worker (e.g., http://127.0.0.1:8787)
    // Ensure the endpoint starts with a '/' if it's an absolute path from that base.
    const requestUrl = `${API_URL}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;

    // Use the apiFetch function which handles credentials and tokens
    const response = await apiFetch(requestUrl, {
      ...options,
      headers: requestHeaders, // Use the Headers object
      credentials: 'include', // Always include credentials for cross-domain cookies
    });
    
    if (!response.ok) {
      let errorData = 'API Error';
      try {
        errorData = await response.text();
      } catch (e) {
        // Ignore if text() fails
      }
      throw new Error(`API error: ${response.status} ${response.statusText} - ${errorData}`);
    }
    
    if (response.status === 204) { // No Content
        return undefined as T;
    }
    // Check if response has a JSON content type before trying to parse
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
        return response.json();
    }
    return response.text() as T; // Or handle non-JSON responses as needed
  },
  
  get<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
    return this.fetch<T>(endpoint, { ...options, method: 'GET' });
  },
  
  post<T = any>(endpoint: string, data: any, options: RequestInit = {}): Promise<T> {
    return this.fetch<T>(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  
  put<T = any>(endpoint: string, data: any, options: RequestInit = {}): Promise<T> {
    return this.fetch<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
  
  delete<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
    return this.fetch<T>(endpoint, { ...options, method: 'DELETE' });
  },
}; 