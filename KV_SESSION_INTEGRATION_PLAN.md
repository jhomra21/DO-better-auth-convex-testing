# KV Session Integration Plan for Enhanced Authentication Performance

**Objective**: Integrate Cloudflare Workers KV to store user session information for faster access in API middlewares after a user is logged in, reducing reliance on D1 database lookups for every authenticated request. This plan outlines changes for the Hono API server and considerations for the SolidJS client.

## 1. Core Principles & Best Practices

- **Cloudflare Workers KV**:
    - Leverage KV for its low-latency read access globally.
    - Store session data as JSON strings.
    - Utilize `expirationTtl` when putting session data into KV to ensure automatic cleanup of expired sessions, aligning with session `expiresAt` timestamps.
    - The existing `SESSIONS_KV` namespace (ID: `f1e66e45cef64aa8bd4b2719022cf6bb`) as defined in `wrangler.jsonc` will be used.
- **Hono**:
    - Implement new authentication logic as Hono middleware.
    - Use `c.env.SESSIONS_KV` to access the KV namespace.
    - Utilize `c.set('user', ...)` and `c.set('sessionData', ...)` to pass authenticated user information and session details through the context.
    - Ensure the new KV-based middleware integrates smoothly with the existing Better Auth flow, running early in the middleware chain for protected routes.
- **Better Auth & D1**:
    - Better Auth continues to handle the primary authentication (OAuth, email/password, D1 user/session table management).
    - KV sessions will be created *after* successful Better Auth D1 session creation and deleted upon logout.
- **SolidJS & Tanstack (Client-Side)**:
    - Client-side token handling (storage, sending in headers) remains largely the same.
    - Auth state management (`useAuth`) should accurately reflect session status. Faster server responses will improve UX.
    - Tanstack Query cache invalidation for user-specific data upon auth state changes should be considered.
- **Security**:
    - Continue using Bearer tokens for API authentication, sent in the `Authorization` header.
    - Session tokens stored in KV should be treated as sensitive.
    - KV session data should contain necessary info for quick validation and user identification but avoid storing overly sensitive details not needed for this purpose (e.g., password hashes).

## 2. Server-Side Implementation (`api/` directory)

### 2.1. KV Namespace Setup

- **Use Existing KV Namespace**:
    - Your `wrangler.jsonc` already defines `SESSIONS_KV`. This will be used.
      ```json
      "kv_namespaces": [
        {
          "binding": "SESSIONS_KV",
          "id": "f1e66e45cef64aa8bd4b2719022cf6bb"
        }
      ]
      ```
    - Ensure `SESSIONS_KV` is correctly typed in the Hono `Env` interface in `api/index.ts`.

### 2.2. Session Data Structure in KV

- Define a clear TypeScript interface for the data stored in KV:
  ```typescript
  // In a new file like api/types/kvSession.ts or similar
  export interface KVSessionData {
    userId: string;
    userEmail: string; // For quick access without D1 lookup
    userName?: string; // Optional, for quick access
    createdAt: number; // Timestamp of session creation
    expiresAt: number; // Timestamp of session expiration
    ipAddress?: string;
    userAgent?: string;
    // Add any other relevant non-sensitive session details if needed
  }
  ```

### 2.3. Session Manager (`api/lib/kvSessions.ts`)

- **Purpose**: To abstract KV interactions for session data.
- **Class**: `KVSessionManager`
    - Constructor: Takes `KVNamespace` (i.e., `env.SESSIONS_KV`) as an argument.
    - `async createKVSession(token: string, sessionDetails: KVSessionData): Promise<void>`:
        - Stores `sessionDetails` (JSON-stringified) in `SESSIONS_KV` with `token` as the key.
        - Calculates `ttlSeconds = (sessionDetails.expiresAt - Date.now()) / 1000`.
        - Uses `await kv.put(token,jsonData, { expirationTtl: Math.max(ttlSeconds, 60) })`.
        - Consider logging errors during KV operations.
    - `async validateKVSession(token: string): Promise<KVSessionData | null>`:
        - Retrieves session JSON string from `SESSIONS_KV` using the `token`.
        - Parses the JSON. If parsing fails or no data, return `null`.
        - Explicitly checks `if (Date.now() > sessionData.expiresAt)`, delete from KV and return `null` (as a backup to `expirationTtl`).
        - Returns parsed `KVSessionData` or `null`.
    - `async deleteKVSession(token: string): Promise<void>`:
        - Deletes the session from `SESSIONS_KV` using `await kv.delete(token)`.
    - `async extendKVSession(token: string, newExpiresAt: number): Promise<boolean>`:
        - Fetches current session data using `validateKVSession`.
        - If valid, updates `expiresAt`, re-stringifies, and `put`s back into KV with new `expirationTtl`.
    - `async deleteAllUserKVSessions(userId: string)`: (Optional - More complex, requires secondary index)
        - If implementing "logout all devices", this would involve:
            - Storing a list of active tokens per user: `kv.put(`user_sessions:${userId}`, JSON.stringify([token1, token2]))`.
            - Reading this list, then iterating and calling `deleteKVSession(token)` for each.
            - Deleting the `user_sessions:${userId}` key.
        - *Note: For simplicity, this can be deferred. The primary goal is faster individual session validation.*

### 2.4. KV Authentication Middleware (`api/lib/kvAuthMiddleware.ts`)

- **Purpose**: Fast-path authentication using KV. To be applied to protected routes.
- **File**: `api/lib/kvAuthMiddleware.ts`
  ```typescript
  import { MiddlewareHandler } from 'hono';
  import { KVSessionManager, KVSessionData } // Assuming KVSessionManager is exported from kvSessions.ts
  // Define Hono Env and Variables types as they are in your api/index.ts

  export const kvAuthMiddleware: MiddlewareHandler<Env, Variables> = async (c, next) => {
    const authHeader = c.req.header('Authorization');
    let token: string | undefined;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }

    if (!token) {
      // No token, could be a public route or error handled by subsequent auth.
      // For strictly protected routes using *only* this, return 401 here.
      // For now, let it pass to potentially be handled by Better Auth's DB check or specific route logic.
      // Alternatively, if this middleware IS the sole guard for some routes:
      // return c.json({ error: 'Unauthorized', message: 'No token provided' }, 401);
      await next();
      return;
    }

    const sessionManager = new KVSessionManager(c.env.SESSIONS_KV);
    const sessionData = await sessionManager.validateKVSession(token);

    if (sessionData) {
      // Session is valid in KV
      c.set('user', { // Create a minimal user object from KV data
        id: sessionData.userId,
        email: sessionData.userEmail,
        name: sessionData.userName,
        // Note: emailVerified and other detailed fields are not in KVSessionData by default.
        // If needed frequently, consider adding them or accept that some routes might do a D1 lookup.
      });
      c.set('sessionData', sessionData); // Store full KV session data if needed
      c.set('kvAuthenticated', true); // Flag that KV auth was successful
    } else {
      // Token invalid or expired in KV.
      // Could clear the 'Authorization' header or let Better Auth handle it.
      // For now, just proceed. Better Auth's DB check will be the fallback.
    }
    await next();
  };
  ```

### 2.5. Modifying Better Auth Integration

- **`api/index.ts` (Global Middleware Chain)**:
    - Apply `kvAuthMiddleware` *before* the current comprehensive auth middleware that hits D1.
      ```typescript
      // app.use('*', async (c, next) => { ... existing D1 auth logic ... }) becomes:

      app.use('*', kvAuthMiddleware); // Run KV check first

      app.use('*', async (c, next) => {
        if (c.get('kvAuthenticated')) { // If KV auth succeeded, skip D1 session check
          console.log('[AUTH_MIDDLEWARE] User authenticated via KV session:', c.get('user')?.id);
          await next();
          return;
        }
        console.log('[AUTH_MIDDLEWARE] KV auth failed or skipped, proceeding with D1 auth logic.');
        // ... rest of your existing D1-based auth logic from api/index.ts ...
        // This logic will now serve as a fallback or for initial session creation.
      });
      ```
- **`api/lib/auth.ts` (Inside `createAuth` or its handler where session is confirmed/created by Better Auth)**:
    - After Better Auth successfully creates/validates a session in D1 (e.g., upon login or token exchange):
        - Extract the session token (that Better Auth will send to the client).
        - Gather necessary user details (id, email, name).
        - Create `KVSessionData`.
        - Instantiate `KVSessionManager`.
        - Call `await sessionManager.createKVSession(sessionTokenFromBetterAuth, kvSessionDataPayload);`.
- **Logout Logic**:
    - When a logout request is processed (e.g., in `protectedRoutes.delete('/sessions/current', ...)` or a Better Auth logout endpoint):
        - After Better Auth revokes the D1 session:
            - Get the session token (from request or context).
            - Instantiate `KVSessionManager`.
            - Call `await sessionManager.deleteKVSession(token);`.

### 2.6. Modifying `/session` Endpoint (`api/index.ts`)

- The `/session` endpoint should also leverage KV for faster responses if a KV session exists.
  ```typescript
  app.get('/session', async (c) => {
    if (c.get('kvAuthenticated')) {
      const user = c.get('user');
      const sessionData = c.get('sessionData') as KVSessionData; // Cast if necessary
      return c.json({
        authenticated: true,
        user: user, // Minimal user object from KV
        session: { // Construct a session object compatible with client expectations
          id: 'kv_session', // Indicate it's from KV or use a relevant identifier
          user_id: user.id,
          expires_at: sessionData.expiresAt,
          // token might not be directly stored in KVSessionData if key is the token itself
        },
        source: 'kv'
      });
    }

    // ... existing D1-based logic for /session endpoint as fallback ...
    // This ensures that if KV fails or is bypassed, D1 provides the source of truth.
  });
  ```

## 3. Client-Side Considerations (`src/` directory)

- **`src/lib/useAuth.ts` & `src/lib/AuthProvider.tsx`**:
    - **Token Management**: No change to how tokens are stored (localStorage) or sent.
    - **Session Check**: `getSession()` calls will now hit the modified `/session` endpoint on the server, which prioritizes KV. This should lead to faster perceived auth checks.
    - **Reactivity**: SolidJS signals for `isAuthenticated`, `user`, `isLoading` should continue to work as expected.
    - **User Data**: Be mindful that the initial user object from a KV-backed session might be minimal (`id`, `email`, `name`). If full profile data is needed immediately after login confirmation, the client might still need to fetch it from a dedicated `/profile` endpoint (which would then hit D1). This is a trade-off between speed and data completeness on initial load.
- **`src/lib/api.ts` / `fetchWithAuth.ts`**:
    - No changes required. `fetchWithAuth` will continue to send the token.

## 4. Deployment and Testing

- **`wrangler.jsonc`**: Already configured with `SESSIONS_KV`.
- **Environment Variables**: No new ones specifically for KV if binding is used directly.
- **Local Development (`wrangler dev`)**:
    - KV operations will work locally. Ensure your local dev environment has data or can create it.
    - `miniflare` (used by `wrangler dev`) supports KV emulation.
- **Testing Strategy**:
    - **Login**: Verify D1 session and KV session are created. Token returned to client works for subsequent requests (validated by KV).
    - **Authenticated Requests**: Confirm KV middleware authenticates correctly and rapidly.
    - **Session Expiry**: Test KV `expirationTtl` and explicit `expiresAt` check in `validateKVSession`.
    - **Logout**: Verify D1 and KV sessions are deleted.
    - **Token Revocation/Invalidation**: Ensure invalid/expired tokens are rejected by KV and then by D1.
    - **"Cold Start" with KV**: Verify that if KV misses (e.g. after a KV clear or very old session), the D1 fallback auth logic still works.
    - **Performance**: Measure response times for authenticated endpoints before and after KV integration to quantify improvements.

## 5. Rollout Strategy (Optional)

- Consider feature-flagging the KV session check initially or rolling it out to a subset of users/endpoints if concerned about unforeseen issues.
- Monitor error rates and performance metrics closely post-deployment.

## 6. Future Enhancements

- **"Logout all devices"**: Implement the secondary index in `KVSessionManager` if this feature is required.
- **More User Data in KV**: Evaluate adding more non-sensitive, frequently accessed user data to `KVSessionData` to further reduce D1 lookups, balancing storage/update costs with read speed benefits.
- **Session Activity Tracking**: `extendKVSession` can also be used to update a `lastActiveAt` timestamp within the KV session data.

This revised plan provides a more robust and best-practice-aligned approach to integrating KV for session management. 