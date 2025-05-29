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
  private _lastUpdateTimestamp: number | null = null;
  private _clientId: string | null = null;
  private _receivedUpdates: Set<string> = new Set();
  
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
    }, 10000); // Reduced to 10-second ping interval for more aggressive keep-alive
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
    
    // Attempt reconnection with shorter timeouts
    if (this.updateCallbacks.length > 0) {
      this.reconnectTimeout = window.setTimeout(() => {
        console.log("Attempting to reconnect WebSocket...");
        this.connectWebSocket();
        
        // If we're still not connected after reconnect attempt, try again with increasing delays
        if (this.socket?.readyState !== WebSocket.OPEN) {
          const retryReconnect = (attempt = 1) => {
            window.setTimeout(() => {
              if (this.socket?.readyState !== WebSocket.OPEN) {
                console.log(`Retry reconnection attempt ${attempt}...`);
                this.connectWebSocket();
                
                // Continue retry loop with increasing delays up to 5 attempts
                if (attempt < 5 && this.updateCallbacks.length > 0) {
                  retryReconnect(attempt + 1);
                }
              }
            }, Math.min(1000 * attempt, 5000)); // Increasing delay, max 5 seconds
          };
          
          retryReconnect();
        }
      }, 1000); // Reduced initial reconnection delay to 1 second
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
      
      // Never close the WebSocket connection if we're on the notes page
      // This prevents any disconnection issues when switching tabs or devices
      // We'll rely on browser/network timeouts to eventually clean up
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
  
  // Socket event handler for receiving messages
  private handleWebSocketMessage(event: MessageEvent) {
    try {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'connected':
          // Store our client ID
          this._clientId = data.clientId;
          console.log(`WebSocket connected with client ID: ${this._clientId}`);
          break;
          
        case 'subscribed':
        case 'update':
          if (data.notes) {
            // Store the latest update timestamp
            const timestamp = data.timestamp || Date.now();
            
            // Only update if this is newer than our last update
            // or if it's an initial subscription
            if (data.type === 'subscribed' || 
                !this._lastUpdateTimestamp || 
                timestamp >= this._lastUpdateTimestamp) {
              
              this._lastUpdateTimestamp = timestamp;
              this.updateCallbacks.forEach(callback => callback(data.notes));
              
              // If this is an update with an ID, acknowledge receipt
              if (data.updateId && !this._receivedUpdates.has(data.updateId)) {
                this._receivedUpdates.add(data.updateId);
                // Limit set size to prevent memory leaks
                if (this._receivedUpdates.size > 100) {
                  const toDelete = Array.from(this._receivedUpdates)[0];
                  this._receivedUpdates.delete(toDelete);
                }
                
                // Send acknowledgment
                if (this.socket?.readyState === WebSocket.OPEN) {
                  this.socket.send(JSON.stringify({
                    type: 'ack',
                    updateId: data.updateId
                  }));
                }
              }
            } else {
              console.log(`Ignoring outdated update (${new Date(timestamp).toISOString()})`);
            }
          }
          break;
          
        case 'pong':
          // Handle server pong - connection is alive
          break;
          
        case 'healthcheck':
          // Server is checking if we're alive, respond with a ping
          if (this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({ type: 'ping' }));
          }
          break;
          
        default:
          break;
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
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
    
    // Set a timeout to detect if connection is stalling
    const connectionTimeout = window.setTimeout(() => {
      if (this.socket?.readyState === WebSocket.CONNECTING) {
        // Connection is taking too long, force close and retry
        console.log("WebSocket connection attempt timed out");
        this.cleanupConnection();
        this.reconnect();
      }
    }, 5000);
    
    this.socket.addEventListener('open', () => {
      console.log("WebSocket connection established");
      window.clearTimeout(connectionTimeout);
      this.setConnectionState(true);
      
      if (this.socket?.readyState === WebSocket.OPEN) {
        // Subscribe to notes updates
        this.socket.send(JSON.stringify({ type: 'subscribe' }));
        // Start heartbeat
        this.startHeartbeat();
        
        // Connection established, refresh our data to get latest state
        this.refreshData();
      }
    });
    
    // Use our consolidated message handler
    this.socket.addEventListener('message', this.handleWebSocketMessage.bind(this));
    
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
      if (document.visibilityState === 'visible') {
        console.log("Page became visible, reconnecting WebSocket");
        // Always try to reconnect when page becomes visible
        this.connectWebSocket();
        
        // Force refresh data on tab focus if we have a working connection
        if (this.socket?.readyState === WebSocket.OPEN) {
          this.refreshData();
        }
      }
    });
    
    // Additional event to handle mobile devices going to sleep and waking up
    document.addEventListener('resume', () => {
      console.log("Device resumed, reconnecting WebSocket");
      this.connectWebSocket();
    });
    
    // Also try reconnecting on window resize events, which can indicate 
    // device orientation changes or app switching
    window.addEventListener('resize', debounce(() => {
      console.log("Window resized, checking WebSocket connection");
      if (this.socket?.readyState !== WebSocket.OPEN) {
        this.connectWebSocket();
      }
    }, 1000));
  }
  
  // Request fresh data from the server
  private refreshData() {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: 'refresh' }));
    }
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

// Utility function to debounce events
function debounce(fn: Function, delay: number) {
  let timer: number | null = null;
  return function(...args: any[]) {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      fn(...args);
      timer = null;
    }, delay);
  };
}

export const notesAPI = new NotesAPI(); 