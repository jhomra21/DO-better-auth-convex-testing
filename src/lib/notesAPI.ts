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
  private updateCallbacks: NotesUpdateCallback[] = [];
  
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
      
      // Close WebSocket if no more subscribers
      if (this.updateCallbacks.length === 0 && this.socket) {
        this.socket.close();
        this.socket = null;
      }
    };
  }
  
  private connectWebSocket() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) return;
    if (this.socket && this.socket.readyState === WebSocket.CONNECTING) return;
    
    const token = localStorage.getItem('bearer_token');
    if (!token) return;
    
    // Close any existing socket that's in a bad state
    if (this.socket) {
      try {
        this.socket.close();
      } catch (e) {
        console.error("Error closing existing WebSocket:", e);
      }
      this.socket = null;
    }
    
    // Pass token as a query parameter for WebSocket authentication
    this.socket = new WebSocket(`${getWsUrl()}/api/notes-ws/ws?token=${encodeURIComponent(token)}`);
    
    this.socket.addEventListener('open', () => {
      console.log("WebSocket connection established");
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        // Subscribe to notes updates
        this.socket.send(JSON.stringify({ type: 'subscribe' }));
      }
    });
    
    this.socket.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if ((data.type === 'subscribed' || data.type === 'update') && data.notes) {
          // Notify all subscribers when we receive either the initial data or an update
          this.updateCallbacks.forEach(callback => callback(data.notes));
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    });
    
    this.socket.addEventListener('close', (event) => {
      console.log(`WebSocket closed with code: ${event.code}, reason: ${event.reason}`);
      this.socket = null;
      
      // Try to reconnect after a delay if we still have subscribers
      if (this.updateCallbacks.length > 0) {
        setTimeout(() => this.connectWebSocket(), 2000);
      }
    });
    
    this.socket.addEventListener('error', (error) => {
      console.error('WebSocket error:', error);
      // Don't close here, let the close handler deal with reconnection
    });
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