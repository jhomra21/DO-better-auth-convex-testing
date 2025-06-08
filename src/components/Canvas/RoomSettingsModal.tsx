import { createSignal, type Accessor, createEffect } from 'solid-js';
import { Button } from '~/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { Checkbox } from '~/components/ui/checkbox';
import { Label } from '~/components/ui/label';
import { createMutation, useQueryClient } from '@tanstack/solid-query';
import { getApiUrl } from '~/lib/utils';

// Define a type for expected API error responses
interface ApiError {
  message?: string;
  error?: string; // Or other properties your API might return
}

// Client-side representation of a Canvas Room, matching API response
// This might need to be in a shared types file later
export interface ClientCanvasRoom {
  id: string;
  name: string;
  description: string | null;
  creator_id: string;
  is_public: boolean;
  max_participants: number;
  created: string; // Assuming string from JSON
  updated: string; // Assuming string from JSON
}

interface RoomSettingsModalProps {
  isOpen: Accessor<boolean>;
  onClose: () => void;
  room: Accessor<ClientCanvasRoom | null>;
  roomId: string;
}

interface UpdateRoomSettingsPayload {
  name?: string;
  description?: string | null;
  is_public?: boolean;
  max_participants?: number;
}

export default function RoomSettingsModal(props: RoomSettingsModalProps) {
  const [name, setName] = createSignal('');
  const [description, setDescription] = createSignal('');
  const [isPublic, setIsPublic] = createSignal(false);
  const [maxParticipants, setMaxParticipants] = createSignal(10);

  const queryClient = useQueryClient();

  createEffect(() => {
    const currentRoom = props.room();
    if (currentRoom) {
      setName(currentRoom.name);
      setDescription(currentRoom.description || '');
      setIsPublic(currentRoom.is_public);
      setMaxParticipants(currentRoom.max_participants);
    } else {
      // Reset if room becomes null (e.g., on error or if modal is reused weirdly)
      setName('');
      setDescription('');
      setIsPublic(false);
      setMaxParticipants(10);
    }
  });

  const updateSettingsMutation = createMutation(() => ({
    mutationFn: async (payload: UpdateRoomSettingsPayload) => {
      const response = await fetch(`${getApiUrl()}/api/canvas/rooms/${props.roomId}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
      });

      if (!response.ok) {
        let errorDetail: ApiError = { message: `Request failed with status ${response.status}` };
        try {
          const parsedError = await response.json(); // This can be unknown
          // Safely check properties on parsedError
          if (parsedError && typeof parsedError === 'object') {
            const potentialError = parsedError as ApiError;
            if (typeof potentialError.message === 'string' || typeof potentialError.error === 'string') {
              errorDetail = potentialError;
            }
          }
        } catch (e) {
          // JSON parsing failed or not an object, stick with the status code message
          console.error("Failed to parse error response JSON or unexpected format:", e);
        }
        throw new Error(errorDetail.message || errorDetail.error || 'Failed to update settings');
      }
      // If response.ok, assume it returns the updated ClientCanvasRoom or a success message.
      // For now, let's assume it returns the updated room data.
      return response.json() as Promise<ClientCanvasRoom>; 
    },
    onSuccess: (data: ClientCanvasRoom) => { // Type the data parameter
      queryClient.invalidateQueries({ queryKey: ['canvas', 'room', props.roomId] });
      // Optionally, update the specific query data if the API returns the full updated room
      // queryClient.setQueryData(['canvas', 'room', props.roomId], data);
      props.onClose();
    },
    onError: (error: Error) => {
      console.error('Error updating room settings:', error);
      // Optionally show an error toast/notification to the user
    },
  }));

  const handleSubmit = () => {
    const payload: UpdateRoomSettingsPayload = {};
    const currentRoom = props.room();
    if (!currentRoom) return;

    if (name().trim() !== currentRoom.name && name().trim() !== '') {
      payload.name = name().trim();
    }
    if (description() !== (currentRoom.description || '')) {
      payload.description = description(); // Send empty string if cleared, or null based on DB preference
    }
    if (isPublic() !== currentRoom.is_public) {
      payload.is_public = isPublic();
    }
    if (Number(maxParticipants()) !== currentRoom.max_participants) {
      payload.max_participants = Number(maxParticipants());
    }

    if (Object.keys(payload).length > 0) {
      updateSettingsMutation.mutate(payload);
    } else {
      props.onClose(); // No changes, just close
    }
  };

  const handleNameChange = (value: string) => setName(value);
  const handleDescriptionChange = (value: string) => setDescription(value);
  const handleMaxParticipantsChange = (value: string) => {
    const num = parseInt(value, 10);
    if (value === '') {
      setMaxParticipants(0); // Or currentRoom.min_participants or a defined minimum
    } else if (!isNaN(num)) {
      setMaxParticipants(num);
    }
    // If it's not a number and not empty, it might be invalid input, decide how to handle.
    // For now, it just won't update if parseInt fails and value is not empty.
  };

  return (
    <Dialog open={props.isOpen()} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent class="sm:max-w-[525px] bg-background text-foreground">
        <DialogHeader>
          <DialogTitle>Room Settings: {props.room()?.name || ''}</DialogTitle>
          <DialogDescription>
            Update the settings for your canvas room. Click save when you're done.
          </DialogDescription>
        </DialogHeader>
        <div class="grid gap-4 py-4">
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="room-name" class="text-right">Name</Label>
            <Input id="room-name" type="text" value={name()} onChange={handleNameChange} class="col-span-3" />
          </div>
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="room-description" class="text-right">Description</Label>
            <Input id="room-description" value={description()} onChange={handleDescriptionChange} multiline class="col-span-3 min-h-[80px]" />
          </div>
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="room-public" class="text-right col-span-1 self-center">Public</Label>
            <div class="col-span-3 flex items-center">
              <Checkbox id="room-public" checked={isPublic()} onChange={setIsPublic} class="mr-2" />
              <Label for="room-public" class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Make this room discoverable by others.
              </Label>
            </div>
          </div>
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="room-max-participants" class="text-right">Max Participants</Label>
            <Input id="room-max-participants" type="number" value={maxParticipants().toString()} onChange={handleMaxParticipantsChange} class="col-span-3" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={props.onClose} disabled={updateSettingsMutation.isPending}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={updateSettingsMutation.isPending}
          >
            {updateSettingsMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 