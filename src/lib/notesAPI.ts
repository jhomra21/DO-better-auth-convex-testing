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
  private _previousNotes: Note[] | null = null;
  private _deletedNoteIds: Set<string> | null = null;
  private _editedNoteIds: Set<string> | null = null;
  
  // Batching and deduplication
  private _pendingRefresh: Promise<Note[]> | null = null;
  private _lastRefreshTime: number = 0;
  private _refreshDebounceTimeout: number | null = null;
  private _webSocketMessageQueue: any[] = [];
  private _messageFlushTimeout: number | null = null;
  
  // Store clientId in localStorage for persistence across page refreshes
  private persistClientId(clientId: string) {
    try {
      localStorage.setItem('notes_client_id', clientId);
    } catch (e) {
      console.error('Failed to persist client ID:', e);
    }
  }
  
  private getPersistedClientId(): string | null {
    try {
      return localStorage.getItem('notes_client_id');
    } catch (e) {
      console.error('Failed to get persisted client ID:', e);
      return null;
    }
  }
  
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
        this.socket.send(JSON.stringify({ 
          type: 'ping',
          clientId: this._clientId // Include client ID in heartbeats
        }));
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
  
  // Batch WebSocket messages to prevent flooding
  private queueWebSocketMessage(message: any) {
    this._webSocketMessageQueue.push(message);
    
    // Clear existing timeout
    if (this._messageFlushTimeout !== null) {
      window.clearTimeout(this._messageFlushTimeout);
    }
    
    // Process messages in batch after short delay
    this._messageFlushTimeout = window.setTimeout(() => {
      this.flushWebSocketMessages();
    }, 50); // 50ms batch window
  }
  
  private flushWebSocketMessages() {
    if (this._webSocketMessageQueue.length === 0) return;
    
    console.log(`Processing ${this._webSocketMessageQueue.length} batched WebSocket messages`);
    
    // Sort messages by timestamp to ensure proper ordering
    const sortedMessages = this._webSocketMessageQueue.sort((a, b) => {
      const timestampA = a.timestamp || 0;
      const timestampB = b.timestamp || 0;
      return timestampA - timestampB;
    });
    
    // Process each message
    sortedMessages.forEach(data => {
      this.processWebSocketMessage(data);
    });
    
    // Clear the queue
    this._webSocketMessageQueue = [];
    this._messageFlushTimeout = null;
  }

  // Handle incoming WebSocket messages
  private handleWebSocketMessage(event: MessageEvent) {
    try {
      const data = JSON.parse(event.data);
      
      console.log("WebSocket message received:", data.type);
      
      // For real-time critical messages, process immediately
      if (data.type === 'connected' || data.type === 'identifyRequest' || 
          data.type === 'pong' || data.type === 'healthcheck') {
        this.processWebSocketMessage(data);
      } else {
        // Batch other messages to prevent flooding
        this.queueWebSocketMessage(data);
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  }
  
  // Process individual WebSocket messages
  private processWebSocketMessage(data: any) {
      
      switch (data.type) {
        case 'connected':
          // Store our client ID
          this._clientId = data.clientId;
          this.persistClientId(data.clientId);
          console.log(`WebSocket connected with client ID: ${this._clientId}`);
          break;
          
        case 'identifyRequest':
          // Server doesn't recognize us, send our stored clientId
          console.log('Server requested identification');
          if (this._clientId && this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
              type: 'identify',
              clientId: this._clientId
            }));
          } else {
            // Force reconnection if we don't have a client ID
            console.log('No client ID available, forcing reconnection');
            this.cleanupConnection();
            this.reconnect();
          }
          break;
          
        case 'identityRecovered':
          console.log(`Identity recovered: ${data.clientId}`);
          // Request a refresh to ensure we have the latest data
          if (this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({ 
              type: 'refresh',
              clientId: this._clientId 
            }));
          }
          break;
          
        case 'initialSync':
          console.log(`Received initial sync with ${data.notes.length} notes`);
          // Initial data after connecting, always use this
          this._previousNotes = [...data.notes];
          this._lastUpdateTimestamp = data.timestamp;
          this.updateCallbacks.forEach(callback => callback(data.notes));
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
        
              // Special handling for delete operations
              if (data.operation === 'delete' && data.affectedNoteId) {
                console.log(`Deletion operation detected for note ID: ${data.affectedNoteId}`);
                
                // Initialize deletedNoteIds if needed
                if (!this._deletedNoteIds) {
                  this._deletedNoteIds = new Set<string>();
                }
                
                // Track this as a deleted note ID
                this._deletedNoteIds.add(data.affectedNoteId);
                
                // Immediately update local state to remove the deleted note
                // This prevents any flashing of old content
                if (this._previousNotes) {
                  // Filter out the deleted note by ID
                  const updatedNotes = this._previousNotes.filter(note => 
                    note.id !== data.affectedNoteId
                  );
                  
                  // If our length changed, we had the note and removed it
                  if (updatedNotes.length < this._previousNotes.length) {
                    console.log(`Locally removed deleted note ID: ${data.affectedNoteId}`);
                    this._previousNotes = updatedNotes;
                    // Force update all subscribers with our manually filtered notes
                    this.updateCallbacks.forEach(callback => callback(updatedNotes));
                    
                    // Then trigger a full refresh after the UI has updated
                    setTimeout(() => {
                      this.forceCompleteRefresh();
                    }, 100);
                    
                    // Skip the standard update flow for deletes
                    break;
                  }
                }
                
                // ALWAYS force a refresh for delete operations to ensure consistency
                this.forceCompleteRefresh();
              } else if (data.operation === 'update' && data.affectedNoteId) {
                // For updates, make sure we're applying them correctly by ID
                console.log(`Update operation detected for note ID: ${data.affectedNoteId}`);
                
                // Keep track of edited note IDs
                if (!this._editedNoteIds) {
                  this._editedNoteIds = new Set<string>();
                }
                this._editedNoteIds.add(data.affectedNoteId);
                
                // Apply the update as normal
                this._previousNotes = [...data.notes];
                this.updateCallbacks.forEach(callback => callback(data.notes));
              } else {
                // Check for length changes to detect potential delete operations
                if (this._previousNotes && this._previousNotes.length > data.notes.length) {
                  console.log('Detected possible delete operation via length change, forcing refresh');
                  this.forceCompleteRefresh();
                } else {
                  // Normal operation, update as usual
                  this._previousNotes = [...data.notes];
                  this.updateCallbacks.forEach(callback => callback(data.notes));
                }
              }
              
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
                    updateId: data.updateId,
                    clientId: this._clientId
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
            this.socket.send(JSON.stringify({ 
              type: 'ping',
              clientId: this._clientId
            }));
          }
          break;
          
        default:
          break;
      }
  }
  
  // Completely refresh our state from the server bypassing all caches
  private forceCompleteRefresh() {
    console.log("Forcing complete refresh of notes state");
    
    // Use debounced refresh to prevent rapid-fire requests
    this.debouncedRefresh();
  }
  
  // Debounced refresh to batch rapid requests
  private debouncedRefresh() {
    // Clear existing timeout
    if (this._refreshDebounceTimeout !== null) {
      window.clearTimeout(this._refreshDebounceTimeout);
    }
    
    // If we have a pending refresh, return it
    if (this._pendingRefresh) {
      console.log("Refresh already pending, reusing existing request");
      return this._pendingRefresh;
    }
    
    // Check if we refreshed very recently (within 500ms)
    const now = Date.now();
    if (now - this._lastRefreshTime < 500) {
      console.log("Recent refresh detected, debouncing request");
      this._refreshDebounceTimeout = window.setTimeout(() => {
        this.executePendingRefresh();
      }, 300);
      return;
    }
    
    // Execute immediately if no recent refresh
    this.executePendingRefresh();
  }
  
  private executePendingRefresh() {
    // Prevent duplicate requests
    if (this._pendingRefresh) {
      return this._pendingRefresh;
    }
    
    console.log("Executing batched refresh request");
    this._lastRefreshTime = Date.now();
    
    // First clear any cached data
    this._previousNotes = null;
    
    // Create the refresh promise
    this._pendingRefresh = this.getNotes(true)
      .then(notes => {
        console.log(`Batched refresh got ${notes.length} notes directly from server`);
        // Manually update our subscribers with the forced fresh data
        this._previousNotes = [...notes];
        this.updateCallbacks.forEach(callback => callback(notes));
        return notes;
      })
      .catch(error => {
        console.error("Error during batched refresh:", error);
        throw error;
      })
      .finally(() => {
        // Clear the pending refresh
        this._pendingRefresh = null;
      });
    
    return this._pendingRefresh;
  }
  
  // Add a forceRefresh parameter to getNotes
  async getNotes(forceRefresh = false): Promise<Note[]> {
    // Add a cache-busting parameter when forcing refresh
    const url = new URL(`${getApiUrl()}/api/notes`);
    if (forceRefresh) {
      url.searchParams.append('_t', Date.now().toString());
    }
    
    const response = await fetch(url.toString(), {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      // Use no-cache when forcing refresh
      cache: forceRefresh ? 'no-cache' : 'default'
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch notes');
    }
    
    const data = await response.json() as { notes: Note[] };
    return data.notes;
  }
  
  // Make connectWebSocket public so it can be used from components
  public connectWebSocket() {
    // Don't reconnect if already connected or connecting
    if (this.socket?.readyState === WebSocket.OPEN || 
        this.socket?.readyState === WebSocket.CONNECTING) return;
    
    // We no longer need to manually get a token from local storage.
    // The browser will handle sending the httpOnly cookie automatically
    // for the WebSocket connection handshake, provided the backend is configured for it.
    
    // Clean up any existing socket
    this.cleanupConnection();
    
    // Get persisted client ID if available
    const persistedClientId = this.getPersistedClientId();
    if (persistedClientId) {
      this._clientId = persistedClientId;
    }
    
    // Create new connection. The browser will send cookies automatically.
    const wsUrl = new URL(`${getWsUrl()}/api/notes-ws/ws`);
    if (this._clientId) {
      wsUrl.searchParams.append('clientId', this._clientId);
    }
    
    this.socket = new WebSocket(wsUrl.toString());
    
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
        this.socket.send(JSON.stringify({ 
          type: 'subscribe',
          clientId: this._clientId // Include our client ID in all messages
        }));
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
      this.socket.send(JSON.stringify({ 
        type: 'refresh',
        clientId: this._clientId // Include client ID for proper tracking
      }));
    }
  }
  
  constructor() {
    this.setupNetworkListeners();
  }

  async createNote(text: string): Promise<Note> {
    const response = await fetch(`${getApiUrl()}/api/notes`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
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
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
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
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
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