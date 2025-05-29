import { createSignal, Show, For, onMount, onCleanup, createEffect } from 'solid-js';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import {
  useNotesQuery,
  useCreateNoteMutation,
  useUpdateNoteMutation,
  useDeleteNoteMutation,
} from '../../lib/notes-actions';
import { useAuthGuard } from '~/lib/authGuard';
import { createFileRoute } from '@tanstack/solid-router';
import { loadSession, protectedLoader } from '~/lib/protectedRoute';
import { notesAPI } from '~/lib/notesAPI';
import type { Note } from '~/lib/notesAPI';
import styles from './notes.module.css';

// Don't extract just the method - it loses its 'this' binding
// Instead, create a function that calls the method properly
const getNotes = () => notesAPI.getNotes();

export default function NotesPage() {
  const [newNoteText, setNewNoteText] = createSignal('');
  const [editingId, setEditingId] = createSignal<string | null>(null);
  const [editText, setEditText] = createSignal('');
  const [realtimeNotes, setRealtimeNotes] = createSignal<Note[]>([]);
  const [isWebSocketConnected, setIsWebSocketConnected] = createSignal(false);
  const [reconnecting, setReconnecting] = createSignal(false);
  // Track the last time we refreshed our notes
  const [lastRefreshTime, setLastRefreshTime] = createSignal<number>(Date.now());
  const [deletedNoteIds, setDeletedNoteIds] = createSignal<Set<string>>(new Set());

  const notesQuery = useNotesQuery();
  const createNote = useCreateNoteMutation();
  const updateNote = useUpdateNoteMutation();
  const deleteNote = useDeleteNoteMutation();

  // Initialize with data from query when it's available
  const notes = () => {
    const realTimeData = realtimeNotes();
    if (realTimeData.length > 0) {
      // If we have real-time data, use it
      return realTimeData;
    }
    return notesQuery.data || [];
  };
  
  // Force a complete refresh of notes data
  const forceRefresh = async () => {
    console.log("Component forcing complete notes refresh");
    try {
      // Force a fresh fetch from the server with no caching
      const freshNotes = await notesAPI.getNotes(true);
      console.log(`Received ${freshNotes.length} notes in forced refresh`);
      
      // Before updating the UI, we need to make sure not to revert edits
      // This prevents the brief flash of unedited notes before deletion
      if (realtimeNotes().length > 0) {
        // Create a map of current notes by ID
        const currentNotesMap = new Map(
          realtimeNotes().map(note => [note.id, note])
        );
        
        // Check if we have fewer notes than before (deletion case)
        if (freshNotes.length < realtimeNotes().length) {
          console.log("Detected note deletion in refresh");
          
          // Get the set of note IDs from the fresh data
          const freshNoteIds = new Set(freshNotes.map(note => note.id));
          
          // Find notes that were deleted (in current but not in fresh)
          const deletedIds = Array.from(currentNotesMap.keys())
            .filter(id => !freshNoteIds.has(id));
          
          if (deletedIds.length > 0) {
            console.log(`Notes deleted: ${deletedIds.join(', ')}`);
            
            // Add the deleted notes to our tracking set
            updateDeletedNoteIds(deletedIds);
            
            // Immediately update our local state to remove the deleted notes
            // This prevents any flashing of old content
            setRealtimeNotes(current => 
              current.filter(note => !deletedIds.includes(note.id))
            );
            
            // If we're editing a deleted note, cancel the edit
            const currentEditingId = editingId();
            if (currentEditingId && deletedIds.includes(currentEditingId)) {
              setEditingId(null);
              setEditText('');
            }
            
            // Set a short timeout before applying the full refresh
            // This helps prevent UI flashing
            setTimeout(() => {
              setRealtimeNotes(freshNotes);
            }, 50);
            
            setLastRefreshTime(Date.now());
            return; // Skip the immediate update
          }
        }
      }
      
      // Normal case - just update the state
      setRealtimeNotes(freshNotes);
      setLastRefreshTime(Date.now());
      
      // Also force a refetch of the query for consistency
      void notesQuery.refetch();
    } catch (error) {
      console.error("Error in force refresh:", error);
    }
  };

  // Monitor changes in the notes array to detect potential deletions
  createEffect(() => {
    const currentNotes = notes();
    // If we're editing a note that no longer exists, cancel the edit
    if (editingId() && !currentNotes.some(note => note.id === editingId())) {
      console.log(`Note being edited no longer exists (ID: ${editingId()}), canceling edit`);
      setEditingId(null);
      setEditText('');
    }
    
    // If we should have notes (previously had some) but now have none, force a refresh
    // This helps catch missed delete operations
    if (currentNotes.length === 0 && lastRefreshTime() < Date.now() - 1000) {
      console.log("Possible missed delete operation - notes array is now empty");
      forceRefresh();
    }
  });

  onMount(() => {
    // Force an immediate refresh on mount
    void forceRefresh();
    
    // Subscribe to WebSocket updates
    const unsubscribe = notesAPI.subscribe((notes) => {
      console.log(`Received ${notes.length} notes from WebSocket`);
      
      // Check for deleted notes
      const currentNoteIds = new Set(realtimeNotes().map(note => note.id));
      const newNoteIds = new Set(notes.map(note => note.id));
      
      // Find deleted notes (in current but not in new)
      const deleted = Array.from(currentNoteIds)
        .filter(id => !newNoteIds.has(id));
      
      if (deleted.length > 0) {
        console.log(`WebSocket detected deleted notes: ${deleted.join(', ')}`);
        
        // Handle each deleted note with animation
        deleted.forEach(id => markNoteAsDeleted(id));
        
        // If we're editing a deleted note, cancel the edit
        const currentEditingId = editingId();
        if (currentEditingId && deleted.includes(currentEditingId)) {
          setEditingId(null);
          setEditText('');
        }
      } else {
        // Normal update
        setRealtimeNotes(notes);
      }
    });
    
    // Subscribe to connection state changes
    const unsubscribeConnection = notesAPI.onConnectionStateChange((connected) => {
      setIsWebSocketConnected(connected);
      if (!connected) {
        setReconnecting(true);
      } else {
        // When we reconnect, force a refresh to ensure we have latest data
        forceRefresh();
      }
    });

    onCleanup(() => {
      // Unsubscribe when component unmounts
      unsubscribe();
      unsubscribeConnection();
    });
  });

  const handleCreate = async () => {
    const text = newNoteText().trim();
    if (!text) return;
    
    try {
      // Clear input early for better UX
      setNewNoteText('');
      await createNote.mutateAsync(text);
      
      // Force a refresh after creation to ensure all clients are in sync
      setTimeout(() => {
        forceRefresh();
      }, 300);
    } catch (error) {
      console.error("Error creating note:", error);
      // Restore the input value on error
      setNewNoteText(text);
      alert("Failed to create note. Please try again.");
    }
  };

  const startEdit = (id: string, currentText: string) => {
    setEditingId(id);
    setEditText(currentText);
  };

  const handleUpdate = async (id: string) => {
    const text = editText().trim();
    if (!text) return;
    
    try {
      await updateNote.mutateAsync({ id, text });
      setEditingId(null);
      setEditText('');
      
      // Force a refresh after update to ensure all clients are in sync
      setTimeout(() => {
        forceRefresh();
      }, 300);
    } catch (error) {
      console.error("Error updating note:", error);
      alert("Failed to update note. Please try again.");
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this note?')) {
      try {
        await deleteNote.mutateAsync(id);
        
        // Force multiple refreshes after deletion to ensure all clients catch the delete
        // First immediate refresh
        forceRefresh();
        
        // Then another delayed refresh to catch any sync issues
        setTimeout(() => {
          forceRefresh();
        }, 500);
      } catch (error) {
        console.error("Error deleting note:", error);
        alert("Failed to delete note. Please try again.");
      }
    }
  };

  // Add CSS class to notes that are being deleted for animation
  const getNoteClass = (note: Note) => {
    if (deletedNoteIds().has(note.id)) {
      return `${styles.note} ${styles.deleted}`;
    }
    return styles.note;
  };
  
  // Mark a note as deleted with animation
  const markNoteAsDeleted = (noteId: string) => {
    const updatedDeletedNoteIds = new Set(deletedNoteIds());
    updatedDeletedNoteIds.add(noteId);
    setDeletedNoteIds(updatedDeletedNoteIds);
    
    // Remove from DOM after animation completes
    setTimeout(() => {
      setRealtimeNotes(current => current.filter(note => note.id !== noteId));
    }, 300); // Match this with CSS transition time
  };
  
  // Monitor the notes array for changes that might indicate deletions
  createEffect(() => {
    const notes = realtimeNotes();
    const queryData = notesQuery.data;
    // If we suddenly have no notes but had notes before, it might be a missed deletion
    if (notes.length === 0 && queryData && queryData.length > 0) {
      const timeSinceLastRefresh = Date.now() - lastRefreshTime();
      if (timeSinceLastRefresh > 1000) { // Only if it's been more than a second
        console.log("Empty notes array detected - potential missed deletion - forcing refresh");
        void forceRefresh();
      }
    }
  });
  
  // Add the deleted notes to our tracking set
  const updateDeletedNoteIds = (ids: string[]) => {
    const updatedDeletedNoteIds = new Set(deletedNoteIds());
    ids.forEach(id => updatedDeletedNoteIds.add(id));
    setDeletedNoteIds(updatedDeletedNoteIds);
  };

  return (
    <div class="container mx-auto p-6">
      <h1 class="text-3xl font-bold mb-6">My Personal Notes</h1>
      <p class="text-gray-600 mb-8">
        Each user gets their own isolated database via Durable Objects
      </p>

      {/* WebSocket status indicator */}
      <div class="mb-4 flex items-center">
        <span class={`inline-block w-3 h-3 rounded-full mr-2 ${
          isWebSocketConnected() ? 'bg-green-500' : 
          reconnecting() ? 'bg-yellow-500' : 'bg-red-500'
        }`}></span>
        <span class="text-sm text-gray-600">
          {isWebSocketConnected() ? 'Real-time updates active' : 
           reconnecting() ? 'Reconnecting...' : 'Real-time updates unavailable'}
        </span>
        
        {/* Manual reconnect button when disconnected */}
        <Show when={!isWebSocketConnected()}>
          <Button 
            variant="outline" 
            size="sm" 
            class="ml-2"
            onClick={() => notesAPI.connectWebSocket()}
            disabled={reconnecting()}
          >
            Reconnect
          </Button>
        </Show>
      </div>

      {/* Create new note */}
      <Card class="mb-6">
        <CardHeader>
          <CardTitle>Create New Note</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="flex gap-2">
            <Input
              placeholder="Enter your note..."
              value={newNoteText()}
              onChange={(value) => setNewNoteText(value)}
              onKeyPress={(e) => e.key === 'Enter' && handleCreate()}
            />
            <Button 
              onClick={handleCreate}
              disabled={createNote.isPending || !newNoteText().trim()}
            >
              {createNote.isPending ? 'Creating...' : 'Add Note'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Notes list */}
      <div class="space-y-4">
        <Show when={notesQuery.isSuccess || realtimeNotes().length > 0} fallback={<p>Loading notes...</p>}>
          <div class="grid gap-4">
            <Show when={realtimeNotes().length === 0}>
              <div class="text-center p-4">
                <p class="text-muted-foreground">No notes yet. Create your first note!</p>
              </div>
            </Show>
            <For each={realtimeNotes()}>
              {(note) => (
                <Card 
                  class={getNoteClass(note)}
                  classList={{
                    'border-primary': editingId() === note.id
                  }}
                >
                  <CardHeader class="p-4 pb-2 flex flex-row justify-between items-start">
                    <CardTitle class="text-xl font-medium">
                      Note {note.id.slice(0, 4)}
                    </CardTitle>
                    <div class="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => startEdit(note.id, note.text)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(note.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent class="p-4 pt-2">
                    <Show when={editingId() === note.id} fallback={
                      <div class="whitespace-pre-wrap break-words">{note.text}</div>
                    }>
                      <div class="flex flex-col gap-2">
                        <Input
                          value={editText()}
                          onChange={(value) => setEditText(value)}
                          onKeyPress={(e) => e.key === 'Enter' && handleUpdate(note.id)}
                        />
                        <div class="flex gap-2">
                          <Button 
                            onClick={() => handleUpdate(note.id)}
                            disabled={updateNote.isPending}
                          >
                            Save
                          </Button>
                          <Button 
                            variant="outline"
                            onClick={() => setEditingId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    </Show>
                  </CardContent>
                </Card>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}

function ProtectedNotesPage() {
  useAuthGuard({ requireAuth: true });
  return <NotesPage />;
}

export const Route = createFileRoute('/dashboard/notes')({
  component: ProtectedNotesPage,
  beforeLoad: () => protectedLoader(),
  loader: async ({ context: { queryClient } }) => {
    // First load the session (using cached session data)
    const sessionData = await loadSession();
    
    // Then pre-fetch notes data using the function wrapper
    await queryClient.ensureQueryData({
      queryKey: ['notes'],
      queryFn: getNotes,
    });
    
    return {
      session: sessionData,
      // Notes will be available via the query cache
    };
  },
}); 