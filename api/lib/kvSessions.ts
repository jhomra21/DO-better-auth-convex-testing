import type { User } from '../types';

export interface KVSessionData {
  userId: string;
  userEmail: string;
  userName: string;
  createdAt: number;
  expiresAt: number;
  ipAddress?: string;
  userAgent?: string;
}

export class KVSessionManager {
  constructor(private kv: KVNamespace) {}

  // Generate secure session token
  private generateToken(): string {
    return crypto.randomUUID() + '-' + crypto.randomUUID();
  }

  // Create session in KV with automatic TTL
  async createSession(
    user: User, 
    expiresAt: Date = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days default
    ipAddress?: string,
    userAgent?: string
  ): Promise<string> {
    const token = this.generateToken();
    
    const sessionData: KVSessionData = {
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      createdAt: Date.now(),
      expiresAt: expiresAt.getTime(),
      ipAddress,
      userAgent
    };

    // Calculate TTL in seconds
    const ttlSeconds = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
    
    try {
      // Store session with TTL for automatic cleanup
      await this.kv.put(
        `session:${token}`, 
        JSON.stringify(sessionData),
        { expirationTtl: Math.max(ttlSeconds, 60) } // Minimum 1 minute
      );

      // Track active sessions for this user (for multi-device logout)
      await this.addToUserSessions(user.id, token, expiresAt);
      
      return token;
    } catch (error) {
      console.error('Failed to create session:', error);
      throw new Error('Session creation failed');
    }
  }

  // Fast session lookup from edge KV
  async validateSession(token: string): Promise<KVSessionData | null> {
    if (!token) return null;

    try {
      const sessionJson = await this.kv.get(`session:${token}`);
      
      if (!sessionJson) {
        return null;
      }

      const session = JSON.parse(sessionJson) as KVSessionData;
      
      // Additional expiration check (backup to KV TTL)
      if (Date.now() > session.expiresAt) {
        await this.deleteSession(token);
        return null;
      }
      
      return session;
    } catch (error) {
      console.error('Session validation error:', error);
      return null;
    }
  }

  // Delete session
  async deleteSession(token: string): Promise<void> {
    try {
      // Get session to find user ID for cleanup
      const session = await this.validateSession(token);
      
      // Delete the session
      await this.kv.delete(`session:${token}`);
      
      // Remove from user's session tracking
      if (session) {
        await this.removeFromUserSessions(session.userId, token);
      }
    } catch (error) {
      console.error('Session deletion error:', error);
    }
  }

  // Extend session TTL
  async extendSession(token: string, newExpiresAt: Date): Promise<boolean> {
    const session = await this.validateSession(token);
    if (!session) return false;

    try {
      const updatedSession = {
        ...session,
        expiresAt: newExpiresAt.getTime()
      };

      const ttlSeconds = Math.floor((newExpiresAt.getTime() - Date.now()) / 1000);
      
      await this.kv.put(
        `session:${token}`,
        JSON.stringify(updatedSession),
        { expirationTtl: Math.max(ttlSeconds, 60) }
      );
      
      return true;
    } catch (error) {
      console.error('Session extension error:', error);
      return false;
    }
  }

  // Track user sessions for multi-device support
  private async addToUserSessions(userId: string, token: string, expiresAt: Date): Promise<void> {
    try {
      const userSessionsKey = `user_sessions:${userId}`;
      const existingJson = await this.kv.get(userSessionsKey);
      
      let sessions: string[] = [];
      if (existingJson) {
        sessions = JSON.parse(existingJson);
      }
      
      // Add new session
      sessions.push(token);
      
      // Keep only the last 10 sessions per user
      if (sessions.length > 10) {
        const oldSessions = sessions.slice(0, -10);
        // Clean up old sessions
        await Promise.all(oldSessions.map(t => this.kv.delete(`session:${t}`)));
        sessions = sessions.slice(-10);
      }
      
      const ttlSeconds = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
      await this.kv.put(
        userSessionsKey,
        JSON.stringify(sessions),
        { expirationTtl: Math.max(ttlSeconds, 60) }
      );
    } catch (error) {
      console.error('Failed to track user session:', error);
    }
  }

  private async removeFromUserSessions(userId: string, token: string): Promise<void> {
    try {
      const userSessionsKey = `user_sessions:${userId}`;
      const existingJson = await this.kv.get(userSessionsKey);
      
      if (!existingJson) return;
      
      const sessions: string[] = JSON.parse(existingJson);
      const filtered = sessions.filter(t => t !== token);
      
      if (filtered.length > 0) {
        await this.kv.put(userSessionsKey, JSON.stringify(filtered), {
          expirationTtl: 86400 * 30 // 30 days
        });
      } else {
        await this.kv.delete(userSessionsKey);
      }
    } catch (error) {
      console.error('Failed to remove user session tracking:', error);
    }
  }

  // Logout all sessions for a user
  async logoutAllUserSessions(userId: string): Promise<void> {
    try {
      const userSessionsKey = `user_sessions:${userId}`;
      const sessionsJson = await this.kv.get(userSessionsKey);
      
      if (!sessionsJson) return;
      
      const sessions: string[] = JSON.parse(sessionsJson);
      
      // Delete all sessions
      await Promise.all([
        ...sessions.map(token => this.kv.delete(`session:${token}`)),
        this.kv.delete(userSessionsKey)
      ]);
      
      console.log(`Logged out ${sessions.length} sessions for user ${userId}`);
    } catch (error) {
      console.error('Failed to logout all user sessions:', error);
    }
  }

  // Get session count for monitoring
  async getUserSessionCount(userId: string): Promise<number> {
    try {
      const userSessionsKey = `user_sessions:${userId}`;
      const sessionsJson = await this.kv.get(userSessionsKey);
      
      if (!sessionsJson) return 0;
      
      const sessions: string[] = JSON.parse(sessionsJson);
      return sessions.length;
    } catch {
      return 0;
    }
  }
}

// Helper function to extract token from request
export function extractToken(request: Request): string | null {
  // Try Authorization header first
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  // Try cookie
  const cookie = request.headers.get('Cookie');
  if (cookie) {
    const match = cookie.match(/auth_token=([^;]+)/);
    if (match) {
      return match[1];
    }
  }
  
  return null;
}
