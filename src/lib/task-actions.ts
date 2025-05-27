import { convex } from './convex';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

// Define TaskDoc here as the central place for this type
export interface TaskDoc {
  _id: Id<"tasks">;
  text?: string;
  isCompleted?: boolean;
  // Add other fields from your 'tasks' table schema here as needed
}

export const getTasks = async (): Promise<TaskDoc[]> => {
  const data = await convex.query(api.tasks.get, {});
  // The `as TaskDoc[]` assertion assumes the data from api.tasks.get matches TaskDoc[]
  // For more robustness, you might consider runtime validation here if the API schema could drift
  return data as TaskDoc[];
};

export const addTask = (variables: { text: string; isCompleted: boolean }): Promise<Id<"tasks">> => {
  return convex.mutation(api.tasks.add, variables);
}

export const updateTask = (variables: { id: Id<"tasks">; text?: string; isCompleted?: boolean }): Promise<null> => {
  return convex.mutation(api.tasks.update, variables);
}

export const deleteTask = (variables: { id: Id<"tasks"> }): Promise<null> => {
  return convex.mutation(api.tasks.deleteMutation, variables);
} 