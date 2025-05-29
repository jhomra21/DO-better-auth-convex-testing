// Helper function to get the API URL
export function getApiUrl(): string {
  if (typeof window === 'undefined') return '';
  
  // Check if we're in development
  const isDev = import.meta.env.DEV;
  
  if (isDev) {
    return 'http://127.0.0.1:8787';
  } else {
    // Return the production API URL
    return 'https://better-auth-api-cross-origin.jhonra121.workers.dev';
  }
}

// Helper to get WebSocket URL
export function getWsUrl(): string {
  if (typeof window === 'undefined') return '';
  
  const isDev = import.meta.env.DEV;
  
  if (isDev) {
    // Convert HTTP to WS protocol
    return 'ws://127.0.0.1:8787';
  } else {
    // Convert HTTPS to WSS protocol
    return 'wss://better-auth-api-cross-origin.jhonra121.workers.dev';
  }
}

export interface Note {
  id: string;
  text: string;
  userId: string;
  created: string;
  updated: string;
}

type NotesUpdateCallback = (notes: Note[]) => void;

class NotesAPI {
  private socket: WebSocket | null = null;
  private pingInterval: number | null = null;
  private reconnectTimeout: number | null = null;
  private updateCallbacks: NotesUpdateCallback[] = [];
  private connectionStateCallbacks: ((connected: boolean) => void)[] = [];
  
  // Track connection state
  private _connected = false;
  
  // Add connection state tracking
  onConnectionStateChange(callback: (connected: boolean) => void): () => void {
    this.connectionStateCallbacks.push(callback);
    // Immediately call with current state
    callback(this._connected);
    return () => {
      this.connectionStateCallbacks = this.connectionStateCallbacks.filter(cb => cb !== callback);
    };
  }
  
  private setConnectionState(state: boolean) {
    if (this._connected !== state) {
      this._connected = state;
      this.connectionStateCallbacks.forEach(cb => cb(state));
    }
  }
  
  // Keep the connection alive with ping/pong
  private startHeartbeat() {
    this.stopHeartbeat(); // Clear any existing interval
    this.pingInterval = window.setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ type: 'ping' }));
      } else {
        this.reconnect();
      }
    }, 20000); // 20-second ping interval
  }
  
  private stopHeartbeat() {
    if (this.pingInterval !== null) {
      window.clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
  
  private reconnect() {
    // Clear existing timeout
    if (this.reconnectTimeout !== null) {
      window.clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    // Attempt reconnection with exponential backoff
    if (this.updateCallbacks.length > 0) {
      this.reconnectTimeout = window.setTimeout(() => {
        console.log("Attempting to reconnect WebSocket...");
        this.connectWebSocket();
      }, 3000);
    }
  }
  
  private getHeaders(): HeadersInit {
    const token = localStorage.getItem('bearer_token');
    return {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
    };
  }

  // Subscribe to real-time updates
  subscribe(callback: NotesUpdateCallback): () => void {
    this.updateCallbacks.push(callback);
    
    // Initialize WebSocket if it doesn't exist
    this.connectWebSocket();
    
    // Return unsubscribe function
    return () => {
      this.updateCallbacks = this.updateCallbacks.filter(cb => cb !== callback);
      
      // If no more subscribers, plan to close the connection after a delay
      // This prevents rapid disconnect/reconnect when switching tabs
      if (this.updateCallbacks.length === 0) {
        window.setTimeout(() => {
          if (this.updateCallbacks.length === 0) {
            this.cleanupConnection();
          }
        }, 30000); // Keep connection for 30s after last subscriber unsubscribes
      }
    };
  }
  
  private cleanupConnection() {
    this.stopHeartbeat();
    if (this.socket) {
      try {
        this.socket.close();
      } catch (e) {
        console.error("Error closing WebSocket:", e);
      }
      this.socket = null;
    }
    this.setConnectionState(false);
  }
  
  // Make connectWebSocket public so it can be used from components
  public connectWebSocket() {
    // Don't reconnect if already connected or connecting
    if (this.socket?.readyState === WebSocket.OPEN || 
        this.socket?.readyState === WebSocket.CONNECTING) return;
    
    const token = localStorage.getItem('bearer_token');
    if (!token) return;
    
    // Clean up any existing socket
    this.cleanupConnection();
    
    // Create new connection with the token
    this.socket = new WebSocket(`${getWsUrl()}/api/notes-ws/ws?token=${encodeURIComponent(token)}`);
    
    this.socket.addEventListener('open', () => {
      console.log("WebSocket connection established");
      this.setConnectionState(true);
      
      if (this.socket?.readyState === WebSocket.OPEN) {
        // Subscribe to notes updates
        this.socket.send(JSON.stringify({ type: 'subscribe' }));
        // Start heartbeat
        this.startHeartbeat();
      }
    });
    
    this.socket.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case 'subscribed':
          case 'update':
            if (data.notes) {
              this.updateCallbacks.forEach(callback => callback(data.notes));
            }
            break;
          case 'pong':
            // Handle server pong - connection is alive
            break;
          default:
            break;
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    });
    
    this.socket.addEventListener('close', (event) => {
      console.log(`WebSocket closed with code: ${event.code}, reason: ${event.reason}`);
      this.setConnectionState(false);
      this.stopHeartbeat();
      this.socket = null;
      this.reconnect();
    });
    
    this.socket.addEventListener('error', (error) => {
      console.error('WebSocket error:', error);
      this.setConnectionState(false);
      // Error will trigger close event, which will handle reconnection
    });
  }
  
  // Handle network status and visibility changes
  setupNetworkListeners() {
    window.addEventListener('online', () => {
      console.log("Network connection restored, reconnecting WebSocket");
      this.connectWebSocket();
    });
    
    // Handle page visibility changes - reconnect when page becomes visible again
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && 
          (!this.socket || this.socket.readyState !== WebSocket.OPEN)) {
        console.log("Page became visible, reconnecting WebSocket");
        this.connectWebSocket();
      }
    });
  }
  
  constructor() {
    this.setupNetworkListeners();
  }

  async getNotes(): Promise<Note[]> {
    const response = await fetch(`${getApiUrl()}/api/notes`, {
      headers: this.getHeaders(),
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch notes');
    }
    
    const data = await response.json() as { notes: Note[] };
    return data.notes;
  }

  async createNote(text: string): Promise<Note> {
    const response = await fetch(`${getApiUrl()}/api/notes`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ text }),
    });
    
    if (!response.ok) {
      throw new Error('Failed to create note');
    }
    
    const data = await response.json() as { note: Note };
    return data.note;
  }

  async updateNote(id: string, text: string): Promise<Note> {
    const response = await fetch(`${getApiUrl()}/api/notes/${id}`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify({ text }),
    });
    
    if (!response.ok) {
      throw new Error('Failed to update note');
    }
    
    const data = await response.json() as { note: Note };
    return data.note;
  }

  async deleteNote(id: string): Promise<void> {
    const response = await fetch(`${getApiUrl()}/api/notes/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    
    if (!response.ok) {
      throw new Error('Failed to delete note');
    }
  }
}

export const notesAPI = new NotesAPI(); 