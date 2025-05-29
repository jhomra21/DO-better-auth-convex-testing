import { drizzle } from 'drizzle-orm/durable-sqlite';
import * as schema from '../db/notes-schema';
import * as notes from '../db/notes-operations';
import type { NotesDB } from '../db/notes-types';
import { migrate } from 'drizzle-orm/durable-sqlite/migrator';
// @ts-ignore - Drizzle migrations don't have TypeScript definitions
import migrations from '../drizzle/migrations';

export interface Env {
  USER_NOTES_DATABASE: DurableObjectNamespace;
  // Include other bindings as needed
}

export class UserNotesDatabase {
  private db: NotesDB;
  private userId: string;
  private state: DurableObjectState;
  private env: Env;
  private sessions: Set<WebSocket> = new Set();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    
    // Extract userId from the Durable Object ID
    this.userId = state.id.toString();
    
    // Initialize Drizzle with Durable Object storage
    this.db = drizzle(state.storage, { schema, logger: true });

    // Run migrations on cold start - but don't block on them
    // since our fallback will work if needed
    this._migrate().catch(error => {
      console.error("Background migration failed:", error);
    });
  }

  // Notes CRUD operations
  async getNotes(): Promise<ReturnType<typeof notes.getNotes>> {
    return await notes.getNotes(this.db, this.userId);
  }

  async createNote(noteData: Parameters<typeof notes.createNote>[1]): Promise<ReturnType<typeof notes.createNote>> {
    const note = await notes.createNote(this.db, { ...noteData, userId: this.userId });
    // Broadcast update to all connected clients
    this.broadcastUpdate();
    return note;
  }

  async updateNote(noteId: string, updates: Parameters<typeof notes.updateNote>[3]): Promise<ReturnType<typeof notes.updateNote>> {
    const note = await notes.updateNote(this.db, noteId, this.userId, updates);
    // Broadcast update to all connected clients
    if (note) {
      this.broadcastUpdate();
    }
    return note;
  }

  async deleteNote(noteId: string): Promise<ReturnType<typeof notes.deleteNote>> {
    const note = await notes.deleteNote(this.db, noteId, this.userId);
    // Broadcast update to all connected clients
    if (note) {
      this.broadcastUpdate();
    }
    return note;
  }

  // Broadcast updated notes to all connected WebSocket clients
  private async broadcastUpdate(): Promise<void> {
    if (this.sessions.size === 0) return;
    
    try {
      const notes = await this.getNotes();
      const message = JSON.stringify({
        type: 'update',
        notes,
        timestamp: Date.now()  // Add timestamp to help clients detect out-of-order updates
      });
      
      // Track which sessions received the update successfully
      const failedSessions: WebSocket[] = [];
      
      // Send to all connected clients
      this.sessions.forEach(session => {
        try {
          if (session.readyState === WebSocket.OPEN) {
            session.send(message);
          } else if (session.readyState === WebSocket.CONNECTING) {
            // Session is still connecting, mark it for retry
            failedSessions.push(session);
          } else {
            // Session is closing or closed, remove it
            this.sessions.delete(session);
          }
        } catch (error) {
          console.error("Error sending to WebSocket:", error);
          failedSessions.push(session);
        }
      });
      
      // Retry sending to any sessions that failed or were connecting
      if (failedSessions.length > 0) {
        // Wait a short time to allow connections to establish
        await new Promise(resolve => setTimeout(resolve, 500));
        
        for (const session of failedSessions) {
          try {
            if (session.readyState === WebSocket.OPEN) {
              session.send(message);
            } else if (session.readyState !== WebSocket.CONNECTING) {
              // Remove any sessions that are no longer valid
              this.sessions.delete(session);
            }
          } catch (error) {
            console.error("Error in retry sending to WebSocket:", error);
            // Remove failed session
            this.sessions.delete(session);
          }
        }
      }
      
      // Schedule a delayed rebroadcast to catch any reconnecting clients
      // This helps with cross-device syncing where connections might be unstable
      setTimeout(() => {
        this.rebroadcastToNewSessions(notes);
      }, 2000);
      
    } catch (error) {
      console.error("Error broadcasting update:", error);
    }
  }
  
  // Helper to rebroadcast to sessions that might have reconnected
  private async rebroadcastToNewSessions(notesToBroadcast: any[]): Promise<void> {
    if (this.sessions.size === 0) return;
    
    try {
      const message = JSON.stringify({
        type: 'update',
        notes: notesToBroadcast,
        timestamp: Date.now(),
        isRebroadcast: true
      });
      
      // Only send to sessions that are definitely open
      this.sessions.forEach(session => {
        try {
          if (session.readyState === WebSocket.OPEN) {
            session.send(message);
          }
        } catch (error) {
          console.error("Error in delayed rebroadcast:", error);
          this.sessions.delete(session);
        }
      });
    } catch (error) {
      console.error("Error in rebroadcast:", error);
    }
  }

  private async _migrate() {
    try {
      // First check if the notes table exists
      const tableExists = await this.tableExists('notes');
      
      if (tableExists) {
        console.log("Notes table already exists, skipping migration");
        return;
      }
      
      // Skip drizzle migration since it's causing issues
      // Just create the table directly
      await this.createNotesTableDirectly();
      console.log("Created notes table directly");
    } catch (error: any) {
      console.error("Error running migration:", error);
    }
  }
  
  // Helper to check if a table exists
  private async tableExists(tableName: string): Promise<boolean> {
    try {
      const result = await this.db.run(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='${tableName}'
      `);
      return result && Array.isArray(result) && result.length > 0;
    } catch (e) {
      console.error("Error checking if table exists:", e);
      return false;
    }
  }
  
  // Fallback migration if the standard approach fails
  private async createNotesTableDirectly() {
    try {
      await this.db.run(`
        CREATE TABLE IF NOT EXISTS notes (
          id TEXT PRIMARY KEY NOT NULL,
          text TEXT NOT NULL,
          user_id TEXT NOT NULL,
          created INTEGER NOT NULL,
          updated INTEGER NOT NULL
        )
      `);
      console.log("Created notes table directly");
    } catch (e) {
      console.error("Failed to create notes table directly:", e);
      throw e;
    }
  }

  // WebSocket support for real-time updates
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    if (url.pathname === '/websocket' && request.headers.get('Upgrade') === 'websocket') {
      const webSocketPair = new WebSocketPair();
      const [client, server] = Object.values(webSocketPair);
      
      // Add this session to our set of active sessions
      this.sessions.add(server);
      
      // Accept the WebSocket connection
      this.state.acceptWebSocket(server);
      
      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }
    
    // Handle regular HTTP requests
    try {
      const { pathname } = new URL(request.url);
      const method = request.method;

      if (pathname === '/notes' && method === 'GET') {
        const notes = await this.getNotes();
        return Response.json({ notes });
      } 
      
      if (pathname === '/notes' && method === 'POST') {
        const data = await request.json() as { text?: string };
        if (!data.text || typeof data.text !== 'string') {
          return Response.json({ error: 'Invalid note text' }, { status: 400 });
        }
        const note = await this.createNote({ text: data.text, userId: this.userId });
        return Response.json({ note });
      }
      
      const noteIdMatch = pathname.match(/^\/notes\/([^\/]+)$/);
      if (noteIdMatch) {
        const noteId = noteIdMatch[1];
        
        if (method === 'PUT' || method === 'PATCH') {
          const data = await request.json() as { text?: string };
          if (!data.text || typeof data.text !== 'string') {
            return Response.json({ error: 'Invalid note text' }, { status: 400 });
          }
          const note = await this.updateNote(noteId, { text: data.text });
          if (!note) {
            return Response.json({ error: 'Note not found' }, { status: 404 });
          }
          return Response.json({ note });
        }
        
        if (method === 'DELETE') {
          const note = await this.deleteNote(noteId);
          if (!note) {
            return Response.json({ error: 'Note not found' }, { status: 404 });
          }
          return Response.json({ note });
        }
      }
      
      return Response.json({ error: 'Not found' }, { status: 404 });
    } catch (error) {
      console.error('Error handling request:', error);
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    // Handle real-time notes updates
    try {
      const data = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message)) as { type: string };
      
      switch (data.type) {
        case 'subscribe':
          // Client wants to subscribe to notes updates
          ws.send(JSON.stringify({
            type: 'subscribed',
            notes: await this.getNotes()
          }));
          break;
        case 'ping':
          // Respond to client pings to keep connection alive
          ws.send(JSON.stringify({ type: 'pong' }));
          break;
        case 'refresh':
          // Client is requesting a refresh of data
          ws.send(JSON.stringify({
            type: 'update',
            notes: await this.getNotes()
          }));
          break;
        default:
          ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
      }
    } catch (error) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    // Remove the session from our set when it's closed
    this.sessions.delete(ws);
    console.log(`WebSocket closed for user ${this.userId}: ${code} ${reason}`);
    
    // If this was an abnormal closure, try to ping all other sessions
    // to verify they're still alive
    if (code !== 1000 && code !== 1001) {
      for (const session of this.sessions) {
        try {
          session.send(JSON.stringify({ type: 'healthcheck' }));
        } catch (e) {
          // Failed to send, this session is probably dead
          this.sessions.delete(session);
          console.log(`Removed dead session for user ${this.userId}`);
        }
      }
    }
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error(`WebSocket error for user ${this.userId}:`, error);
    // Remove the session on error
    this.sessions.delete(ws);
    ws.close(1011, "WebSocket error");
  }
} 