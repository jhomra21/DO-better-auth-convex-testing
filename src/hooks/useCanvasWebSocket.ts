import { createSignal, onCleanup, type Accessor, createEffect, on } from 'solid-js';
import { getApiUrl } from '~/lib/utils';

// Mirror the CanvasEvent type from $roomId.tsx and CanvasRoom.ts (DO)
// Consider moving this to a shared types file if it becomes more complex or widely used
interface CanvasEventBase {
  type: 'path' | 'text' | 'delete' | 'cursor' | 'clear' | 'undo' | 'redo' | string;
  data: any;
}

// Define specific data structure for cursor events
export interface CursorData {
  x: number;
  y: number;
  // Potentially add 'type: "mouse" | "touch"' if needed later
}

export interface CanvasEvent extends CanvasEventBase {
  id: string;
  room_id: string;
  user_id: string;     // User who performed action (from auth)
  client_id: string;   // Specific client WebSocket connection ID
  timestamp: number;
  userColor?: string; // Added by DO or client for rendering
}

interface WebSocketMessage {
  type: 'events' | 'error' | 'init_state' | 'client_init' | 'cursor_update'; // Added 'cursor_update'
  events?: CanvasEvent[];
  error?: string;
  initialEvents?: CanvasEvent[]; // For the initial dump of events
  clientId?: string; // For client_init message and cursor_update
  userColor?: string; // For client_init message and cursor_update
  cursorData?: CursorData; // For cursor_update message
}

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface OtherUserCursor {
  clientId: string;
  x: number;
  y: number;
  userColor: string;
}

export function useCanvasWebSocket(roomId: Accessor<string>) {
  console.log("[useCanvasWebSocket] Hook initialized/re-run for roomId accesssor. Current value:", roomId()); // Log roomId on init/re-run

  const [socket, setSocket] = createSignal<WebSocket | null>(null);
  const [receivedEvents, setReceivedEvents] = createSignal<CanvasEvent[]>([]);
  const [connectionStatus, setConnectionStatus] = createSignal<ConnectionStatus>('disconnected');
  const [clientId, setClientId] = createSignal(crypto.randomUUID()); // Unique ID for this client session
  const [userColor, setUserColor] = createSignal<string | null>(null);
  const [otherUserCursors, setOtherUserCursors] = createSignal<Record<string, OtherUserCursor>>({});

  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY_MS = 3000;

  const connect = () => {
    const currentRoomId = roomId(); // Get current value from accessor
    console.log("[useCanvasWebSocket] connect() called for roomId:", currentRoomId, "Current socket state:", socket()?.readyState);

    if (socket() && socket()?.readyState === WebSocket.OPEN && socket()?.url.includes(currentRoomId)) {
      console.log('WebSocket already connected to the correct room.');
      return;
    }
    // If socket exists but is for a different room or not open, close it before reconnecting.
    if (socket()) {
        console.log("[useCanvasWebSocket] Existing socket found, closing before reconnecting to new room or if not open. State:", socket()?.readyState);
        socket()?.close(1000, 'Changing room or reconnecting');
        setSocket(null); // Ensure old socket is cleared
    }

    if (!currentRoomId) {
      console.error('Room ID is not available for WebSocket connection.');
      setConnectionStatus('error');
      return;
    }

    const token = localStorage.getItem('bearer_token');
    if (!token) {
      console.error('Auth token (bearer_token) not found. WebSocket connection aborted.');
      setConnectionStatus('error');
      return;
    }

    setConnectionStatus('connecting');
    reconnectAttempts = 0; // Reset reconnect attempts for a fresh connection sequence
    
    const apiBaseUrl = getApiUrl(); // e.g., http://127.0.0.1:8787 or https://prod.api
    // This correctly changes http:// to ws:// and https:// to wss://
    const wsBaseUrl = apiBaseUrl.replace(/^http/, 'ws'); 

    const wsUrl = `${wsBaseUrl}/api/canvas-ws/${currentRoomId}/ws?token=${encodeURIComponent(token)}&clientId=${clientId()}`;
    console.log("Attempting WebSocket connection to:", wsUrl);

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log(`[useCanvasWebSocket] WebSocket connected to room ${currentRoomId}`);
      setConnectionStatus('connected');
      reconnectAttempts = 0;
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string) as WebSocketMessage;
        if (message.type === 'events' && message.events) {
          const newEvents = message.events.filter(e => {
            // Filter out events that originated from this client to prevent echo.
            // This relies on the server echoing events with the original client_id.
            return e.client_id !== clientId(); 
          });
          if (newEvents.length > 0) {
             // console.log('[WebSocket] Received new broadcast events (not own drawing/cursor):', JSON.stringify(newEvents));
             setReceivedEvents(prevEvents => [...prevEvents, ...newEvents]);
          }
        } else if (message.type === 'init_state' && message.initialEvents) {
          console.log(`[useCanvasWebSocket] Received init_state for room ${currentRoomId} with ${message.initialEvents.length} events.`, JSON.stringify(message.initialEvents.slice(0,2))); // Log only first 2 for brevity
          setReceivedEvents(message.initialEvents);
        } else if (message.type === 'client_init' && message.clientId && message.userColor) {
          if (message.clientId === clientId()) {
            setUserColor(message.userColor);
            console.log(`[useCanvasWebSocket] Client initialized with color: ${message.userColor} for room ${currentRoomId}`);
          } else {
            console.warn('[useCanvasWebSocket] Received client_init for a different clientId:', message.clientId);
          }
        } else if (message.type === 'cursor_update' && message.clientId && message.cursorData && message.userColor) {
          if (message.clientId !== clientId()) {
            setOtherUserCursors(prevCursors => ({
              ...prevCursors,
              [message.clientId!]: {
                clientId: message.clientId!,
                x: message.cursorData!.x,
                y: message.cursorData!.y,
                userColor: message.userColor!,
              }
            }));
          }
        } else if (message.type === 'error' && message.error) {
          console.error('[useCanvasWebSocket] WebSocket error message from server:', message.error);
        }
      } catch (e) {
        console.error('[useCanvasWebSocket] Failed to parse WebSocket message:', e);
      }
    };

    ws.onerror = (error) => {
      console.error(`[useCanvasWebSocket] WebSocket error for room ${currentRoomId}:`, error);
      setConnectionStatus('error');
    };

    ws.onclose = (event) => {
      console.log(`[useCanvasWebSocket] WebSocket disconnected from room ${currentRoomId}. Code: ${event.code}, Reason: ${event.reason}`);
      setSocket(null); // Clear the socket from state on close
      if (event.code === 1002 || event.code === 1008 || event.code === 4001) { 
        console.error('[useCanvasWebSocket] WebSocket connection closed due to auth or protocol error. Won\'t reconnect.');
        setConnectionStatus('error');
        return;
      }

      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        console.log(`[useCanvasWebSocket] Attempting to reconnect WebSocket (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}) for room ${currentRoomId}...`);
        setConnectionStatus('connecting');
        setTimeout(connect, RECONNECT_DELAY_MS);
      } else {
        console.error('[useCanvasWebSocket] Max WebSocket reconnect attempts reached for room ${currentRoomId}.');
        setConnectionStatus('error');
      }
    };
    setSocket(ws);
  };

  const disconnect = () => {
    const currentRoomId = roomId(); // Get current value
    console.log("[useCanvasWebSocket] disconnect() called for room:", currentRoomId);
    socket()?.close(1000, 'Client initiated disconnect');
    setSocket(null);
    setConnectionStatus('disconnected');
    setReceivedEvents([]);
    setOtherUserCursors({});
    reconnectAttempts = MAX_RECONNECT_ATTEMPTS; // Prevent auto-reconnect after manual disconnect
  };

  // Effect to automatically connect/disconnect when roomId changes or component mounts/unmounts
  createEffect(on(roomId, (newRoomId: string | undefined, oldRoomId: string | undefined) => {
    console.log(`[useCanvasWebSocket] roomId changed from ${oldRoomId} to ${newRoomId}. Triggering connect/reconnect.`);
    if (newRoomId) {
      // If there was an old room and it's different, ensure disconnect logic for old socket is handled
      // The connect() function now handles closing existing sockets.
      connect();
    } else {
      disconnect();
    }
  }, { defer: false })); // Run immediately on mount and when roomId changes

  const sendEvent = (eventData: CanvasEvent) => {
    if (socket()?.readyState === WebSocket.OPEN) {
      socket()?.send(JSON.stringify(eventData));
      // Optimistically add to local state.
      // The filter in onmessage (e.client_id !== clientId()) will prevent duplication
      // if the server broadcasts this event back to us.
      // console.log('[useCanvasWebSocket] Optimistically adding sent event to local state:', JSON.stringify(eventData));
      setReceivedEvents(prevEvents => [...prevEvents, eventData]);
    } else {
      console.warn('[useCanvasWebSocket] WebSocket not connected. Event not sent.', eventData);
    }
  };

  const sendCursorPosition = (position: CursorData) => {
    if (socket()?.readyState === WebSocket.OPEN) {
      const cursorEvent: CanvasEventBase = {
        type: 'cursor',
        data: position,
      };
      socket()?.send(JSON.stringify(cursorEvent));
    } else {
      // console.warn('WebSocket not connected. Cursor position not sent.');
    }
  };
  
  onCleanup(() => {
    console.log("[useCanvasWebSocket] Hook cleanup for roomId:", roomId(), "Disconnecting WebSocket.");
    disconnect();
  });

  return { connect, disconnect, sendEvent, receivedEvents, connectionStatus, clientId, userColor, sendCursorPosition, otherUserCursors };
} 