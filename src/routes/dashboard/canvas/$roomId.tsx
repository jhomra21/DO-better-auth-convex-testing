import { createFileRoute } from '@tanstack/solid-router';
import { createSignal, onMount, onCleanup, Show, For, type Accessor } from 'solid-js';
import { createQuery } from '@tanstack/solid-query';
import { CanvasComponent } from '~/components/Canvas/CanvasComponent';
import { useCanvasWebSocket } from '~/hooks/useCanvasWebSocket';
import { Button } from '~/components/ui/button';
import RoomSettingsModal, { type ClientCanvasRoom } from '~/components/Canvas/RoomSettingsModal';
import { fetchWithAuth } from '~/lib/utils/fetchWithAuth';
import { getApiUrl } from '~/lib/utils';

// Placeholder for the actual canvas drawing component
// import CanvasComponent from '~/components/Canvas'; 

// Placeholder for WebSocket connection management
// import { useCanvasWebSocket } from '~/hooks/useCanvasWebSocket';

// Define a type for expected API error responses, can be shared if used elsewhere
interface ApiError {
  message?: string;
  error?: string;
}

export const Route = createFileRoute('/dashboard/canvas/$roomId')({
  component: CanvasRoomPage,
  // Add a loader here if you need to fetch initial room data before rendering
  // loader: async ({ params }) => fetchRoomData(params.roomId),
});

// Define the expected structure for canvas events (mirroring DO)
interface CanvasEvent {
  id: string;
  room_id: string;
  user_id: string;
  client_id: string;
  timestamp: number;
  type: 'path' | 'text' | 'delete' | 'cursor' | 'clear' | 'undo' | 'redo' | string; // Allow for custom event types
  data: any; 
  userColor?: string; // Added for rendering
}

// API function to fetch room details
const getCanvasRoomDetails = async (roomId: string): Promise<ClientCanvasRoom> => {
  if (!roomId) throw new Error("Room ID is required to fetch details.");
  const response = await fetchWithAuth(`${getApiUrl()}/api/canvas/rooms/${roomId}`);
  if (!response.ok) {
    let errorDetail: ApiError = { message: `Request failed with status ${response.status}` };
    try {
      const parsedError = await response.json(); // This can be unknown
      if (parsedError && typeof parsedError === 'object') {
        const potentialError = parsedError as ApiError;
        if (typeof potentialError.message === 'string' || typeof potentialError.error === 'string') {
          errorDetail = potentialError;
        }
      }
    } catch (e) {
      console.error("Failed to parse error response JSON or unexpected format:", e);
    }
    throw new Error(errorDetail.message || errorDetail.error || `Failed to fetch room details`);
  }
  return response.json() as Promise<ClientCanvasRoom>; // Assuming response.ok means valid ClientCanvasRoom
};

function CanvasRoomPage() {
  const params = Route.useParams(); 
  const roomId = () => params().roomId; // Create an accessor for roomId
  console.log("[RoomIdPage] Rendering/Re-rendering for roomId:", roomId()); // Added log

  const [isSettingsModalOpen, setIsSettingsModalOpen] = createSignal(false);

  const roomDetailsQuery = createQuery(() => ({
    queryKey: ['canvas', 'room', roomId()],
    queryFn: () => getCanvasRoomDetails(roomId()),
    enabled: !!roomId(),
  }));

  // Create an accessor for the modal's room prop
  const roomDataAccessor: Accessor<ClientCanvasRoom | null> = () => roomDetailsQuery.data || null;

  const {
    connect,
    disconnect,
    sendEvent,
    receivedEvents,
    connectionStatus,
    userColor, // Get userColor from the hook
    sendCursorPosition, // Get sendCursorPosition from the hook
    otherUserCursors,   // Get otherUserCursors from the hook
    clientId // <<< ADDED: Destructure clientId
  } = useCanvasWebSocket(roomId);

  // Signals for any page-specific loading/error states, distinct from WebSocket status
  const [pageError, setPageError] = createSignal<string | null>(null);

  onMount(() => {
    console.log("[RoomIdPage] onMount - roomId:", roomId());
    // connect(); // The hook's internal createEffect on roomId handles connection.
  });

  onCleanup(() => {
    console.log("[RoomIdPage] onCleanup - roomId:", roomId());
    // disconnect(); // The hook's internal onCleanup handles disconnection.
  });

  const handleDrawEvent = (eventData: Parameters<typeof sendEvent>[0]) => {
    sendEvent(eventData);
  };

  const handleCursorMoveEvent = (position: Parameters<typeof sendCursorPosition>[0]) => {
    sendCursorPosition(position);
  };

  // Log before rendering CanvasComponent
  console.log("[RoomIdPage] About to render CanvasComponent. Key:", roomId(), "events length:", receivedEvents().length, "connectionStatus:", connectionStatus());

  return (
    <div class="p-4 md:p-6 h-[calc(100vh-var(--header-height,4rem))] flex flex-col">
      <Show when={pageError()}>
        <p class="text-destructive">Page Error: {pageError()}</p>
      </Show>

      <div class="mb-2 flex justify-between items-center">
        <h1 class="text-xl font-bold">
          Canvas: {roomDetailsQuery.data?.name || roomId()}
        </h1>
        <div class="flex items-center space-x-2">
          <Button 
            variant="outline"
            size="sm"
            onClick={() => setIsSettingsModalOpen(true)}
            disabled={!roomDetailsQuery.isSuccess || !roomDetailsQuery.data}
          >
            Settings
          </Button>
          <p class="text-sm capitalize px-2 py-1 rounded-md"
             classList={{
               'bg-green-100 text-green-700': connectionStatus() === 'connected',
               'bg-yellow-100 text-yellow-700': connectionStatus() === 'connecting',
               'bg-red-100 text-red-700': connectionStatus() === 'error' || connectionStatus() === 'disconnected',
             }}>
            Status: {connectionStatus()}
          </p>
        </div>
      </div>
        
      <div class="flex-grow border border-border rounded-lg bg-background relative shadow-md min-h-[300px]">
        <Show when={roomId()} 
              fallback={<p class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-muted-foreground">
                          Loading room data...
                        </p>}>
          <CanvasComponent 
            // @ts-ignore
            key={roomId()}
            roomId={roomId()}
            events={receivedEvents()}
            onDraw={handleDrawEvent} 
            userColor={userColor()}
            clientId={clientId()} // <<< ADDED: Pass clientId as a prop
            onCursorMove={handleCursorMoveEvent} 
            otherUserCursors={otherUserCursors()}
          />
        </Show>
      </div>

      <Show when={roomDetailsQuery.isSuccess && roomDetailsQuery.data && roomId()}>
        <RoomSettingsModal 
          isOpen={isSettingsModalOpen}
          onClose={() => setIsSettingsModalOpen(false)}
          roomId={roomId()!}
          room={roomDataAccessor}
        />
      </Show>

      {/* Optional: Debugging area for received events */}
      {/* 
      <Show when={otherUserCursors && Object.keys(otherUserCursors()).length > 0}>
        <div class="mt-4 p-2 border rounded-md max-h-40 overflow-y-auto text-xs">
          <h3 class="font-semibold mb-1">Other Cursors:</h3>
          <For each={Object.values(otherUserCursors())}>{cursor => 
            <pre>{JSON.stringify(cursor, null, 2)}</pre>
          }</For>
        </div>
      </Show>
      */}
    </div>
  );
} 