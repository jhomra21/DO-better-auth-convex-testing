import type { UserNotesDatabase } from '../durable-objects/UserNotesDatabase';

type Env = {
  USER_NOTES_DATABASE: DurableObjectNamespace;
};

export function getUserNotesDatabaseStub(env: Env, userId: string): DurableObjectStub {
  const doId = env.USER_NOTES_DATABASE.idFromName(userId);
  return env.USER_NOTES_DATABASE.get(doId);
} 