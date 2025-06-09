export const fetchWithAuth = async (url: string, options?: RequestInit) => {
  // Attempt to get the token from localStorage using the correct key "bearer_token".
  const token = typeof window !== 'undefined' ? localStorage.getItem('bearer_token') : null;
  const headers = new Headers(options?.headers);

  // Default Content-Type to application/json if there's a body and no Content-Type is set.
  if (options?.body && !(options?.headers && (options.headers as Headers).get('Content-Type'))) {
    if (!(headers.has('Content-Type'))) {
        headers.set('Content-Type', 'application/json');
    }
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  // else {
  //   console.warn('[fetchWithAuth] No token found in localStorage for key "bearer_token"');
  // }

  const response = await fetch(url, { ...options, headers , credentials: 'include'});
  return response;
}; 