import { getTasks, type TaskDoc } from './task-actions';

export async function loadTasks(): Promise<TaskDoc[]> {
  // Use the imported getTasks function
  return getTasks();
}
