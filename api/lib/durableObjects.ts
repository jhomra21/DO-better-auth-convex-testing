import type { UserNotesDatabase } from '../durable-objects/UserNotesDatabase';
import type { CanvasRoom } from '../durable-objects/CanvasRoom';

type Env = {
  USER_NOTES_DATABASE: DurableObjectNamespace;
  CANVAS_ROOM: DurableObjectNamespace;
};

export function getUserNotesDatabaseStub(env: Env, userId: string): DurableObjectStub {
  const doId = env.USER_NOTES_DATABASE.idFromName(userId);
  return env.USER_NOTES_DATABASE.get(doId);
}

export function getCanvasRoomStub(env: Env, roomId: string): DurableObjectStub {
  const doId = env.CANVAS_ROOM.idFromName(roomId);
  return env.CANVAS_ROOM.get(doId);
} 