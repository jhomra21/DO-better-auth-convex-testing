import { drizzle } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';
import * as schema from '../db/canvas-schema';
import { getCanvasD1DB, type CanvasRoom as DBCanvasRoom, type CanvasParticipant, type CanvasInvite } from '../db/canvas-types';
// import * as canvasOps from '../db/canvas-operations'; // We might use these if DO interacts with D1 directly for some ops

// Define the environment for the Durable Object
export interface Env {
  DB: D1Database; // For D1 interactions if needed directly, or passed to drizzle
  // USER_NOTES_DATABASE: DurableObjectNamespace; // Example, if it needed to talk to another DO
  // Add other bindings from wrangler.jsonc that this DO might need
}

// Event structure for canvas (as defined in the plan)
interface CanvasEvent {
  id: string;
  room_id: string;
  user_id: string; // The user who performed the action
  client_id: string; // The specific client connection that sent the event
  timestamp: number;
  type: 'path' | 'text' | 'delete' | 'cursor' | 'clear' | 'undo' | 'redo'; // Added more common canvas event types
  data: any; // PathData | TextData | DeleteData | CursorData; // Define these more specifically later
  userColor?: string; // Add userColor directly to the event for easier access
}

interface PathData {
  points: number[];
  strokeWidth: number;
  strokeColor: string;
  tool: string;
}

// Message sent to a client upon successful WebSocket connection
interface ClientInitMessage {
  type: 'client_init';
  clientId: string;
  userColor: string;
}

// Message to send initial state
interface InitialStateMessage {
  type: 'init_state';
  initialEvents: CanvasEvent[];
}

// Message to broadcast cursor updates
interface CursorUpdateMessage {
  type: 'cursor_update';
  clientId: string;
  userColor: string;
  cursorData: any; // Should match CursorData from the client hook ideally {x, y}
}

// ... other data interfaces as needed

export class CanvasRoom {
  private state: DurableObjectState;
  private env: Env;
  private db: ReturnType<typeof getCanvasD1DB>; // Drizzle instance for D1 if used by DO directly
  private roomId: string;

  // WebSocket state
  private sessions: Map<WebSocket, { clientId: string; userId: string; userColor: string }> = new Map();
  private lastKnownRoomState: CanvasEvent[] = []; // Store a history of events for new connections or replay
  
  // Batching for broadcasting updates
  private pendingBroadcastEvents: CanvasEvent[] = [];
  private broadcastTimeout: number | null = null;
  private readonly BROADCAST_INTERVAL_MS = 16; // ~60fps, adjust as needed

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.roomId = state.id.toString();
    this.db = getCanvasD1DB(env.DB); // Initialize D1 access for the DO

    // Load persisted state if any (e.g., canvas events)
    this.state.storage.get<CanvasEvent[]>('canvas_events').then(events => {
      if (events) {
        this.lastKnownRoomState = events;
      }
    });
  }

  // Assigns a consistent color to a user based on their ID
  private getUserColor(userId: string): string {
    const colors = [
      '#FF5733', '#33FF57', '#3357FF', '#F033FF', '#FF33F0',
      '#33FFF0', '#F0FF33', '#FFB033', '#33DFFF', '#C433FF'
    ];
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = ((hash << 5) - hash) + userId.charCodeAt(i);
      hash |= 0; // Convert to 32bit integer
    }
    return colors[Math.abs(hash) % colors.length];
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/websocket' && request.headers.get('Upgrade') === 'websocket') {
      if (this.sessions.size >= 200) { // Example: Limit concurrent connections
        return new Response('Too many connections', { status: 429 });
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      // Extract client ID and user ID from query parameters (ensure they are passed by the client)
      const clientId = url.searchParams.get('clientId') || crypto.randomUUID();
      const userId = url.searchParams.get('userId');

      if (!userId) {
        return new Response('userId query parameter is required', { status: 400 });
      }

      const userColor = this.getUserColor(userId);
      this.sessions.set(server, { clientId, userId, userColor });

      this.state.acceptWebSocket(server);

      // Send initial state and client-specific info to the newly connected client
      // Use a try-catch as the socket might close unexpectedly
      try {
        // Send client-specific initialization info (e.g., their color)
        const clientInitMsg: ClientInitMessage = {
          type: 'client_init',
          clientId: clientId,
          userColor: userColor,
        };
        server.send(JSON.stringify(clientInitMsg));

        // Send the current canvas state (history of events)
        if (this.lastKnownRoomState.length > 0) {
          const initStateMsg: InitialStateMessage = {
            type: 'init_state',
            initialEvents: this.lastKnownRoomState,
          };
          server.send(JSON.stringify(initStateMsg));
        }
      } catch (e) {
        console.error(`Error sending initial messages to client ${clientId} in room ${this.roomId}:`, e);
        // The WebSocket will likely be closed by the error handler if it's critical
      }

      return new Response(null, { status: 101, webSocket: client });
    }

    // TODO: Add HTTP endpoints for room management if DO is responsible (e.g., get room details, settings)
    // Example: Get current room state (event history)
    if (url.pathname === '/events' && request.method === 'GET') {
      return Response.json(this.lastKnownRoomState);
    }

    return new Response('Not found', { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const sessionInfo = this.sessions.get(ws);
    if (!sessionInfo) return; // Should not happen if session is managed correctly

    try {
      // Parse the incoming message first to determine its type
      const parsedMessage = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message));

      if (parsedMessage.type === 'cursor') {
        // Handle cursor events separately: do not persist, broadcast immediately to others
        const cursorData = parsedMessage.data;
        this.broadcastCursorUpdate(ws, {
          type: 'cursor_update',
          clientId: sessionInfo.clientId,
          userColor: sessionInfo.userColor,
          cursorData: cursorData,
        });
        return; // Cursor event handled, no further processing needed for it
      }

      // For other event types (like 'path'), proceed as before
      const eventData = parsedMessage as Omit<CanvasEvent, 'id' | 'room_id' | 'user_id' | 'client_id' | 'timestamp' | 'userColor'>;
      
      const fullEvent: CanvasEvent = {
        ...eventData,
        id: crypto.randomUUID(),
        room_id: this.roomId,
        user_id: sessionInfo.userId,
        client_id: sessionInfo.clientId,
        timestamp: Date.now(),
        userColor: sessionInfo.userColor, // Assign user's color to the event
      };

      // If it's a path event, ensure its data also reflects the user's color for drawing
      if (fullEvent.type === 'path' && fullEvent.data) {
        (fullEvent.data as PathData).strokeColor = sessionInfo.userColor;
      }

      // Process the event (e.g., update local state, validate)
      this.lastKnownRoomState.push(fullEvent);
      // Optional: Limit the size of lastKnownRoomState to prevent memory issues
      if (this.lastKnownRoomState.length > 1000) { // Example limit
         this.lastKnownRoomState.shift(); 
      }

      // Add to batch for broadcasting
      this.pendingBroadcastEvents.push(fullEvent);
      this.scheduleBroadcast();

      // Persist event (optional, can be batched or conditional)
      // For simplicity, persisting all for now. Can be optimized.
      await this.state.storage.put('canvas_events', this.lastKnownRoomState);

    } catch (error) {
      console.error(`Failed to process WebSocket message for room ${this.roomId}:`, error);
      // Optionally send an error message back to the client
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid event data' }));
      }
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    const sessionInfo = this.sessions.get(ws);
    if (sessionInfo) {
      console.log(`Client ${sessionInfo.clientId} (User: ${sessionInfo.userId}) disconnected from room ${this.roomId}. Reason: ${reason} (Code: ${code})`);
      // Optionally, broadcast a 'user_left' event to other clients
      const leaveEvent: CanvasEvent = {
        id: crypto.randomUUID(),
        room_id: this.roomId,
        user_id: sessionInfo.userId,
        client_id: sessionInfo.clientId,
        timestamp: Date.now(),
        type: 'cursor', // Or a new 'user_left' type
        data: { type: 'disconnect' } // Inform clients this user/cursor is gone
      };
      this.pendingBroadcastEvents.push(leaveEvent);
      this.scheduleBroadcast();
    }
    this.sessions.delete(ws);
  }

  async webSocketError(ws: WebSocket, error: any): Promise<void> {
    const sessionInfo = this.sessions.get(ws);
    console.error(`WebSocket error for client ${sessionInfo?.clientId || 'unknown'} in room ${this.roomId}:`, error);
    // webSocketClose will be called subsequently, so cleanup is handled there.
  }

  private scheduleBroadcast(): void {
    if (this.broadcastTimeout === null) {
      this.broadcastTimeout = setTimeout(() => {
        this.executeBroadcast();
        this.broadcastTimeout = null;
      }, this.BROADCAST_INTERVAL_MS) as unknown as number; 
    }
  }

  private executeBroadcast(): void {
    if (this.pendingBroadcastEvents.length === 0) return;

    const eventsToBroadcast = [...this.pendingBroadcastEvents];
    this.pendingBroadcastEvents = []; // Clear pending events before sending

    const message = JSON.stringify({
      type: 'events',
      events: eventsToBroadcast,
    });

    this.sessions.forEach((sessionData, ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          // Optionally, don't send events back to the originating client if they handle optimistically
          // if (sessionData.clientId !== originatingClientId) { ws.send(message); }
          ws.send(message);
        } catch (e) {
          console.error(`Failed to send broadcast to client ${sessionData.clientId} in room ${this.roomId}:`, e);
          // Consider closing WebSocket if send fails repeatedly
        }
      }
    });
  }

  private broadcastCursorUpdate(originatingWs: WebSocket, message: CursorUpdateMessage): void {
    const serializedMessage = JSON.stringify(message);
    this.sessions.forEach((sessionData, ws) => {
      if (ws !== originatingWs && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(serializedMessage);
        } catch (e) {
          console.error(`Failed to send cursor update to client ${sessionData.clientId} in room ${this.roomId}:`, e);
          // Consider closing WebSocket if send fails repeatedly, or handle cleanup on next interaction
        }
      }
    });
  }

  // Example of an alarm if needed for periodic tasks, e.g., saving state or cleanup
  // async alarm() {
  //   // Perform periodic task
  //   await this.state.storage.put('canvas_events', this.lastKnownRoomState);
  //   // Re-schedule alarm if needed
  //   // this.state.storage.setAlarm(Date.now() + SOME_INTERVAL_MS);
  // }
} 