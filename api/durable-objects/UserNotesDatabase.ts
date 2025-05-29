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
  private pendingUpdates: Map<string, { clients: Set<string>, notes: any[], attempts: number, timestamp: number }> = new Map();
  private clientIds: Map<WebSocket, string> = new Map();
  private updateInterval: number | null = null;

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
    
    // Start the update delivery worker
    this.startUpdateWorker();
  }

  // Notes CRUD operations
  async getNotes(): Promise<ReturnType<typeof notes.getNotes>> {
    return await notes.getNotes(this.db, this.userId);
  }

  async createNote(noteData: Parameters<typeof notes.createNote>[1]): Promise<ReturnType<typeof notes.createNote>> {
    const note = await notes.createNote(this.db, { ...noteData, userId: this.userId });
    // Broadcast update to all connected clients
    this.broadcastUpdate('create', note.id);
    return note;
  }

  async updateNote(noteId: string, updates: Parameters<typeof notes.updateNote>[3]): Promise<ReturnType<typeof notes.updateNote>> {
    const note = await notes.updateNote(this.db, noteId, this.userId, updates);
    // Broadcast update to all connected clients
    if (note) {
      this.broadcastUpdate('update', note.id);
    }
    return note;
  }

  async deleteNote(noteId: string): Promise<ReturnType<typeof notes.deleteNote>> {
    const note = await notes.deleteNote(this.db, noteId, this.userId);
    // Broadcast update to all connected clients
    if (note) {
      this.broadcastUpdate('delete', note.id);
    }
    return note;
  }

  // Start a worker that periodically checks for undelivered updates
  private startUpdateWorker() {
    if (this.updateInterval !== null) return;
    
    this.updateInterval = setInterval(() => {
      this.processUndeliveredUpdates();
    }, 5000) as unknown as number; // Cast needed for Cloudflare Workers
  }
  
  private stopUpdateWorker() {
    if (this.updateInterval !== null) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }
  
  // Process any pending updates that haven't been acknowledged
  private async processUndeliveredUpdates() {
    if (this.pendingUpdates.size === 0 || this.sessions.size === 0) return;
    
    const now = Date.now();
    
    // Check each pending update
    for (const [updateId, update] of this.pendingUpdates.entries()) {
      // If update is older than 5 minutes, remove it
      if (now - update.timestamp > 300000) {
        this.pendingUpdates.delete(updateId);
        continue;
      }
      
      // If all clients have acknowledged, remove the update
      if (update.clients.size === 0) {
        this.pendingUpdates.delete(updateId);
        continue;
      }
      
      // Resend to clients who haven't acknowledged
      for (const [ws, clientId] of this.clientIds.entries()) {
        if (update.clients.has(clientId) && ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({
              type: 'update',
              notes: update.notes,
              updateId: updateId,
              timestamp: update.timestamp,
              isRetry: true,
              attempt: update.attempts
            }));
          } catch (error) {
            console.error(`Error sending retry update to client ${clientId}:`, error);
          }
        }
      }
      
      // Increment attempt counter
      update.attempts++;
    }
  }

  // WebSocket support for real-time updates
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    if (url.pathname === '/websocket' && request.headers.get('Upgrade') === 'websocket') {
      const webSocketPair = new WebSocketPair();
      const [client, server] = Object.values(webSocketPair);
      
      // Generate a unique client ID for this connection
      // Extract an existing clientId from the URL if present (for reconnections)
      const urlClientId = url.searchParams.get('clientId');
      const clientId = urlClientId || crypto.randomUUID();
      
      // Add this session to our set of active sessions
      this.sessions.add(server);
      this.clientIds.set(server, clientId);
      
      // Accept the WebSocket connection
      this.state.acceptWebSocket(server);
      
      // Send client ID to the client
      server.send(JSON.stringify({
        type: 'connected',
        clientId
      }));
      
      // Send any pending updates to this new client
      for (const [updateId, update] of this.pendingUpdates.entries()) {
        if (update.clients.has(clientId)) {
          server.send(JSON.stringify({
            type: 'update',
            notes: update.notes,
            updateId,
            timestamp: update.timestamp
          }));
        }
      }
      
      // Also send the current notes state to ensure this client is in sync
      const notes = await this.getNotes();
      server.send(JSON.stringify({
        type: 'initialSync',
        notes,
        timestamp: Date.now()
      }));
      
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
    try {
      const data = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message)) as { 
        type: string;
        updateId?: string;
        clientId?: string;
      };
      
      // Check if the message includes a clientId (for reconnection support)
      if (data.clientId && !this.clientIds.get(ws)) {
        // This could be a reconnecting client that wasn't properly tracked
        console.log(`Registering previously unknown client with ID: ${data.clientId}`);
        this.clientIds.set(ws, data.clientId);
      }
      
      const clientId = this.clientIds.get(ws);
      if (!clientId) {
        console.error("Received message from unknown client, attempting recovery");
        // Don't immediately fail - try to handle the message anyway
        // This will allow clients to reestablish their identity
        if (data.type === 'identify' && data.clientId) {
          this.clientIds.set(ws, data.clientId);
          console.log(`Recovered client identity: ${data.clientId}`);
          
          // Acknowledge the identity recovery
          ws.send(JSON.stringify({
            type: 'identityRecovered',
            clientId: data.clientId
          }));
          
          return;
        }
        
        // For other message types, request client identification
        ws.send(JSON.stringify({ 
          type: 'identifyRequest',
          message: 'Client identity unknown, please identify'
        }));
        return;
      }
      
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
          
        case 'ack':
          // Client is acknowledging receipt of an update
          if (data.updateId) {
            const update = this.pendingUpdates.get(data.updateId);
            if (update) {
              update.clients.delete(clientId);
              
              // If all clients have acknowledged, we can remove the update
              if (update.clients.size === 0) {
                this.pendingUpdates.delete(data.updateId);
              }
            }
          }
          break;
          
        default:
          ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
      }
    } catch (error) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    // Remove the session and client ID
    this.sessions.delete(ws);
    this.clientIds.delete(ws);
    
    console.log(`WebSocket closed for user ${this.userId}: ${code} ${reason}`);
    
    // Stop the update worker if no more sessions
    if (this.sessions.size === 0) {
      this.stopUpdateWorker();
    }
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error(`WebSocket error for user ${this.userId}:`, error);
    // Remove the session and client ID on error
    this.sessions.delete(ws);
    this.clientIds.delete(ws);
    ws.close(1011, "WebSocket error");
    
    // Stop the update worker if no more sessions
    if (this.sessions.size === 0) {
      this.stopUpdateWorker();
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

  // Broadcast updated notes to all connected WebSocket clients
  private async broadcastUpdate(operation: 'create' | 'update' | 'delete' = 'update', affectedNoteId: string | null = null): Promise<void> {
    if (this.sessions.size === 0) return;
    
    try {
      const notes = await this.getNotes();
      const updateId = crypto.randomUUID();
      const timestamp = Date.now();
      
      // Create a set of clients that need to receive this update
      const pendingClients = new Set<string>();
      this.clientIds.forEach(clientId => pendingClients.add(clientId));
      
      // Add to pending updates
      this.pendingUpdates.set(updateId, {
        clients: pendingClients,
        notes,
        attempts: 1,
        timestamp
      });
      
      const message = JSON.stringify({
        type: 'update',
        notes,
        updateId,
        timestamp,
        operation,
        affectedNoteId
      });
      
      // Send to all connected clients
      for (const [ws, clientId] of this.clientIds.entries()) {
        try {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(message);
          }
        } catch (error) {
          console.error(`Error sending update to client ${clientId}:`, error);
          // Don't remove from pendingClients - it will be retried
        }
      }
    } catch (error) {
      console.error("Error broadcasting update:", error);
    }
  }
} 