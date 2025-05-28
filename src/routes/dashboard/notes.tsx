import { createSignal, Show, For, onMount, onCleanup } from 'solid-js';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import {
  useNotesQuery,
  useCreateNoteMutation,
  useUpdateNoteMutation,
  useDeleteNoteMutation
} from '../../lib/notes-actions';
import { useAuthGuard } from '~/lib/authGuard';
import { createFileRoute } from '@tanstack/solid-router';
import { loadSession, protectedLoader } from '~/lib/protectedRoute';
import { notesAPI } from '~/lib/notesAPI';
import type { Note } from '~/lib/notesAPI';

// Don't extract just the method - it loses its 'this' binding
// Instead, create a function that calls the method properly
const getNotes = () => notesAPI.getNotes();

export default function NotesPage() {
  const [newNoteText, setNewNoteText] = createSignal('');
  const [editingId, setEditingId] = createSignal<string | null>(null);
  const [editText, setEditText] = createSignal('');
  const [realtimeNotes, setRealtimeNotes] = createSignal<Note[]>([]);
  const [isWebSocketConnected, setIsWebSocketConnected] = createSignal(false);

  const notesQuery = useNotesQuery();
  const createNote = useCreateNoteMutation();
  const updateNote = useUpdateNoteMutation();
  const deleteNote = useDeleteNoteMutation();

  // Initialize with data from query when it's available
  const notes = () => {
    if (realtimeNotes().length > 0) {
      return realtimeNotes();
    }
    return notesQuery.data || [];
  };

  onMount(() => {
    // Subscribe to WebSocket updates
    const unsubscribe = notesAPI.subscribe((updatedNotes) => {
      setRealtimeNotes(updatedNotes);
      setIsWebSocketConnected(true);
    });

    onCleanup(() => {
      // Unsubscribe when component unmounts
      unsubscribe();
    });
  });

  const handleCreate = async () => {
    const text = newNoteText().trim();
    if (!text) return;
    
    try {
      await createNote.mutateAsync(text);
      setNewNoteText('');
      // Force refresh in case WebSocket update is slow
      notesQuery.refetch();
    } catch (error) {
      console.error("Error creating note:", error);
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
      // Force refresh in case WebSocket update is slow
      notesQuery.refetch();
    } catch (error) {
      console.error("Error updating note:", error);
      alert("Failed to update note. Please try again.");
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this note?')) {
      try {
        await deleteNote.mutateAsync(id);
        // Force refresh in case WebSocket update is slow
        notesQuery.refetch();
      } catch (error) {
        console.error("Error deleting note:", error);
        alert("Failed to delete note. Please try again.");
      }
    }
  };

  return (
    <div class="container mx-auto p-6">
      <h1 class="text-3xl font-bold mb-6">My Personal Notes</h1>
      <p class="text-gray-600 mb-8">
        Each user gets their own isolated database via Durable Objects
      </p>

      {/* WebSocket status indicator */}
      <div class="mb-4">
        <span class={`inline-block w-3 h-3 rounded-full mr-2 ${isWebSocketConnected() ? 'bg-green-500' : 'bg-gray-300'}`}></span>
        <span class="text-sm text-gray-600">
          {isWebSocketConnected() ? 'Real-time updates active' : 'Loading real-time updates...'}
        </span>
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
          <Show when={notes().length} fallback={
            <p class="text-center text-gray-500 mt-8">
              No notes yet. Create your first note above!
            </p>
          }>
            <For each={notes()}>{(note) => (
              <Card>
                <CardContent class="p-4">
                  <Show when={editingId() === note.id} fallback={
                    <div class="flex justify-between items-center">
                      <p class="flex-1">{note.text}</p>
                      <div class="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => startEdit(note.id, note.text)}
                        >
                          Edit
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleDelete(note.id)}
                          disabled={deleteNote.isPending}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  }>
                    <div class="flex gap-2">
                      <Input
                        value={editText()}
                        onChange={(value) => setEditText(value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleUpdate(note.id)}
                      />
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
                  </Show>
                </CardContent>
              </Card>
            )}</For>
          </Show>
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