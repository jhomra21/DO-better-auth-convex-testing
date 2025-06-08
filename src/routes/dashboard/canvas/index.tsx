import { createFileRoute, Link } from '@tanstack/solid-router';
import { For, createSignal, Show, type JSX } from 'solid-js';
import { createQuery, createMutation, useQueryClient } from '@tanstack/solid-query';
import { Button } from '~/components/ui/button'; // Assuming Solid-UI button is here
import { Input } from '~/components/ui/input';   // Assuming Solid-UI input is here
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '~/components/ui/card'; // Assuming Solid-UI card
import { fetchWithAuth } from "~/lib/utils/fetchWithAuth"; // Import the shared utility
import { getApiUrl } from '~/lib/utils';

// Local type alias for CanvasRoom to avoid problematic cross-directory import for now
// Ensure this matches the actual structure from your API and D1 schema
interface CanvasRoom {
  id: string;
  name: string;
  creator_id: string;
  created_at: string | number | Date; 
  updated_at: string | number | Date;
  settings?: Record<string, any>;
}

// Define the expected structure of the API response when creating a room
interface CreateRoomResponse {
    message: string;
    room: CanvasRoom;
}

// Define the expected structure of the API response when fetching rooms (if it's an object with a rooms array)
interface GetRoomsResponse {
    rooms: CanvasRoom[];
    // Or if the API returns an array directly, this can be simplified
}

interface ApiErrorResponse {
    message?: string;
    error?: string; 
}

export const Route = createFileRoute('/dashboard/canvas/')({
  component: CanvasRoomListPage,
});

// Fetch canvas rooms
const getCanvasRooms = async (): Promise<CanvasRoom[]> => {
  const response = await fetchWithAuth(`${getApiUrl()}/api/canvas/rooms`);
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to fetch canvas rooms: ${response.status} ${errorBody || 'Unknown error'}`);
  }
  // Assuming the API /api/canvas/rooms directly returns an array of CanvasRoom objects
  // If it returns an object like { rooms: [...] }, adjust accordingly:
  // const data: GetRoomsResponse = await response.json();
  // return data.rooms;
  return response.json(); 
};

// Create a new canvas room
const createCanvasRoomAPI = async (roomName: string): Promise<CanvasRoom> => {
  const response = await fetchWithAuth(`${getApiUrl()}/api/canvas/rooms`, {
    method: 'POST',
    body: JSON.stringify({ name: roomName }),
  });
  if (!response.ok) {
    let errorMessage = 'Failed to create room with status: ' + response.status;
    try {
        const parsedError = await response.json() as ApiErrorResponse;
        if (parsedError && typeof parsedError.message === 'string') {
            errorMessage = parsedError.message;
        } else if (parsedError && typeof parsedError.error === 'string') {
            errorMessage = parsedError.error;
        }
    } catch (e) { /* Ignore if body isn't JSON or doesn't match expected error structure */ }
    throw new Error(errorMessage);
  }
  const result: CreateRoomResponse = await response.json(); 
  return result.room;
};

function CanvasRoomListPage() {
  const queryClient = useQueryClient();
  const [newRoomName, setNewRoomName] = createSignal('');

  const roomsQuery = createQuery(() => ({
    queryKey: ['canvasRooms'],
    queryFn: getCanvasRooms,
    placeholderData: [], 
  }));

  const mutation = createMutation(() => ({
    mutationFn: createCanvasRoomAPI,
    onSuccess: (newRoom) => {
      queryClient.invalidateQueries({ queryKey: ['canvasRooms'] });
      console.log('Room created:', newRoom);
      setNewRoomName(''); 
    },
    onError: (error: Error) => {
      console.error('Error creating room:', error);
      alert(`Error creating room: ${error.message}`);
    },
  }));

  const handleCreateRoomSubmit = (e: Event) => {
    e.preventDefault();
    if (newRoomName().trim()) {
      mutation.mutate(newRoomName().trim());
    }
  };

  const handleRoomNameChange = (value: string) => {
    setNewRoomName(value);
  };

  return (
    <div class="p-4 md:p-6 space-y-6">
      <h1 class="text-3xl font-bold tracking-tight">Canvas Rooms</h1>
      
      <Card>
        <CardHeader>
          <CardTitle>Create New Canvas Room</CardTitle>
          <CardDescription>Enter a name for your new collaborative canvas.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateRoomSubmit} class="flex items-center space-x-2">
            <Input 
              type="text"
              placeholder="Room Name (e.g., Project Alpha Ideas)"
              value={newRoomName()}
              onChange={handleRoomNameChange}
              class="flex-grow"
              disabled={mutation.isPending}
            />
            <Button type="submit" disabled={mutation.isPending || !newRoomName().trim()}>
              {mutation.isPending ? 'Creating...' : 'Create Room'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Show when={roomsQuery.isLoading}>
        <p>Loading rooms...</p>
      </Show>
      <Show when={roomsQuery.isError && roomsQuery.error}>
        <p class="text-destructive">Error loading rooms: {roomsQuery.error instanceof Error ? roomsQuery.error.message : 'Unknown error'}</p>
      </Show>

      <Show when={roomsQuery.isSuccess && roomsQuery.data && roomsQuery.data.length > 0}>
        <h2 class="text-2xl font-semibold mt-6 mb-4">Existing Rooms</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <For each={roomsQuery.data}>{(room: CanvasRoom) => (
            <Card>
              <CardHeader>
                <CardTitle>{room.name}</CardTitle>
                <CardDescription>ID: {room.id}</CardDescription>
              </CardHeader>
              <CardContent>
                <p>Created by: {room.creator_id}</p> 
                <p>Last updated: {new Date(room.updated_at).toLocaleString()}</p>
              </CardContent>
              <CardFooter>
                <Link to="/dashboard/canvas/$roomId" params={{ roomId: room.id }} class="w-full">
                  <Button variant='outline' class="w-full">Open Canvas</Button>
                </Link>
              </CardFooter>
            </Card>
          )}</For>
        </div>
      </Show>
      <Show when={roomsQuery.isSuccess && roomsQuery.data && roomsQuery.data.length === 0}>
         <p class="text-center text-gray-500 py-8">No canvas rooms yet. Create one to get started!</p>
      </Show>
    </div>
  );
} 