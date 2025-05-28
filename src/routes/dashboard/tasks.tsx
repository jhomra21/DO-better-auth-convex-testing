import { createFileRoute } from '@tanstack/solid-router';
import { useQuery, useQueryClient, useMutation } from '@tanstack/solid-query';
import { For, Show, createSignal, createEffect, onCleanup } from 'solid-js';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { convex } from '../../lib/convex';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "~/components/ui/table";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Checkbox } from "~/components/ui/checkbox";
import { Label } from "~/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "~/components/ui/card";
import { 
  type TaskDoc, 
  getTasks, 
  addTask, 
  updateTask, 
  deleteTask 
} from '../../lib/task-actions';
import { useAuthGuard } from "~/lib/authGuard";
import { protectedLoader, loadSession } from '~/lib/protectedRoute';

function TasksPageComponent() {
  const queryClient = useQueryClient();


  const [newTaskText, setNewTaskText] = createSignal('');
  const [newTaskCompleted, setNewTaskCompleted] = createSignal(false);
  const [editingTask, setEditingTask] = createSignal<TaskDoc | null>(null);
  const [editText, setEditText] = createSignal('');

  const tasksQuery = useQuery<
    TaskDoc[],
    Error
  >(() => ({
    queryKey: ['tasks'],
    queryFn: getTasks,
  }));

  const addTaskMutation = useMutation<
    Id<"tasks">,
    Error,
    { text: string; isCompleted: boolean }
  >(() => ({
    mutationFn: addTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setNewTaskText('');
      setNewTaskCompleted(false);
    },
  }));

  const updateTaskMutation = useMutation<
    null,
    Error,
    { id: Id<"tasks">; text?: string; isCompleted?: boolean }
  >(() => ({
    mutationFn: updateTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setEditingTask(null);
      setEditText('');
    },
  }));

  const deleteTaskMutation = useMutation<
    null,
    Error,
    { id: Id<"tasks"> }
  >(() => ({
    mutationFn: deleteTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  }));

  createEffect(() => {
    const unsubscribe = convex.onUpdate(
      api.tasks.get,
      {},
      (updatedTasks) => {
        queryClient.setQueryData(['tasks'], updatedTasks as TaskDoc[]);
      }
    );
    onCleanup(() => unsubscribe());
  });

  const handleAddTask = () => {
    if (newTaskText().trim()) {
      addTaskMutation.mutate({ text: newTaskText().trim(), isCompleted: newTaskCompleted() });
    }
  };

  const handleStartEdit = (task: TaskDoc) => {
    setEditingTask(task);
    setEditText(task.text || '');
  };

  const handleUpdateTask = () => {
    if (editingTask() && editText().trim()) {
      updateTaskMutation.mutate({ 
        id: editingTask()!._id, 
        text: editText().trim(),
      });
    }
  };

  const toggleComplete = (task: TaskDoc) => {
    updateTaskMutation.mutate({ id: task._id, isCompleted: !task.isCompleted });
  };

  const handleDeleteTask = (id: Id<"tasks">) => {
    deleteTaskMutation.mutate({ id });
  };

  return (
    <div class="p-8 max-w-2xl mx-auto space-y-6">
      <h1 class="text-3xl font-bold text-center text-gray-800">Tasks</h1>

      <Card>
        <CardHeader>
          <CardTitle>Add New Task</CardTitle>
        </CardHeader>
        <CardContent class="space-y-3">
          <div class="flex items-center space-x-2">
            <Input
              name="newTaskText"
              value={newTaskText()}
              onChange={setNewTaskText}
              class="flex-grow"
              placeholder="Enter new task..."
              type="text"
              inputClass="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
              onKeyPress={(e) => e.key === 'Enter' && handleAddTask()}
            />
            <Button
              onClick={handleAddTask}
              disabled={addTaskMutation.isPending || !newTaskText().trim()}
            >
              {addTaskMutation.isPending ? 'Adding...' : 'Add Task'}
            </Button>
          </div>
          <div class="flex items-center space-x-2">
            <Checkbox 
              name="newTaskCompleted"
              id="isCompletedAdd"
              checked={newTaskCompleted()} 
              onChange={setNewTaskCompleted}
            />
            <Label for="isCompletedAdd" class="text-sm font-medium">Completed</Label>
          </div>
          <Show when={addTaskMutation.isError}>
            <p class="text-sm text-red-500">Error adding task: {addTaskMutation.error?.message}</p>
          </Show>
        </CardContent>
      </Card>

      <Show when={editingTask()}>
        <Card>
          <CardHeader>
            <CardTitle>Edit Task</CardTitle>
            <CardDescription>Editing: {editingTask()?.text}</CardDescription>
          </CardHeader>
          <CardContent class="space-y-3">
            <div class="flex items-center space-x-2">
              <Input
                name="editTaskText"
                value={editText()}
                onChange={setEditText}
                class="flex-grow"
                placeholder="Edit task..."
                type="text"
                inputClass="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                onKeyPress={(e) => e.key === 'Enter' && handleUpdateTask()}
              />
              <Button
                onClick={handleUpdateTask}
                disabled={updateTaskMutation.isPending || !editText().trim()}
                variant="outline"
              >
                {updateTaskMutation.isPending && updateTaskMutation.variables?.text ? 'Saving Text...' : 'Save Text'}
              </Button>
            </div>
            <div class="flex items-center space-x-2">
              <Button
                onClick={() => toggleComplete(editingTask()!)}
                disabled={updateTaskMutation.isPending && typeof updateTaskMutation.variables?.isCompleted === 'boolean'}
                variant="outline"
              >
                {updateTaskMutation.isPending && updateTaskMutation.variables?.id === editingTask()?._id && typeof updateTaskMutation.variables?.isCompleted === 'boolean' 
                  ? (editingTask()?.isCompleted ? 'Marking Incomplete...' : 'Marking Complete...') 
                  : (editingTask()?.isCompleted ? 'Mark Incomplete' : 'Mark Complete')}
              </Button>
              <Button
                onClick={() => setEditingTask(null)}
                variant="ghost"
              >
                Cancel Edit
              </Button>
            </div>
            <Show when={updateTaskMutation.isError}>
              <p class="text-sm text-red-500">Error updating task: {updateTaskMutation.error?.message}</p>
            </Show>
          </CardContent>
        </Card>
      </Show>

      <Card>
        <CardHeader>
          <CardTitle>Task List</CardTitle>
        </CardHeader>
        <CardContent>
          <Show when={tasksQuery.isPending || tasksQuery.isLoading}>
            <p class="p-4 text-gray-500">Loading tasks...</p>
          </Show>
          <Show when={tasksQuery.isError}>
            <p class="p-4 text-red-500">Error loading tasks: {tasksQuery.error?.message}</p>
          </Show>
          <Show when={tasksQuery.isSuccess && tasksQuery.data}>
            <Show when={tasksQuery.data!.length === 0}>
              <Table>
                <TableCaption>No tasks found. Add one above!</TableCaption>
              </Table>
            </Show>
            <Show when={tasksQuery.data!.length > 0}>
              <Table>
                <TableCaption>A list of your tasks.</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead class="w-[50%]">Task</TableHead>
                    <TableHead class="w-[20%] text-center">Completed</TableHead>
                    <TableHead class="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <For each={tasksQuery.data}>
                    {(task) => (
                      <TableRow class={`${task.isCompleted ? 'bg-green-50 hover:bg-green-100' : 'hover:bg-gray-50'} transition-colors data-[state=selected]:bg-muted`}>
                        <TableCell class={`font-medium break-all ${task.isCompleted ? 'line-through text-gray-500' : 'text-gray-800'}`}>{task.text ?? 'No text'}</TableCell>
                        <TableCell class="text-center">
                          <Checkbox 
                            name={`task-completed-${task._id}`}
                            id={`task-${task._id}-completed`}
                            checked={task.isCompleted ?? false} 
                            onChange={() => toggleComplete(task)}
                            disabled={updateTaskMutation.isPending && updateTaskMutation.variables?.id === task._id && typeof updateTaskMutation.variables?.isCompleted === 'boolean'}
                          />
                        </TableCell>
                        <TableCell class="text-right">
                          <div class="flex items-center justify-end space-x-1 whitespace-nowrap">
                            <Button
                              onClick={() => handleStartEdit(task)}
                              disabled={!!editingTask() || (updateTaskMutation.isPending && updateTaskMutation.variables?.id === task._id) }
                              variant="outline" 
                              size="sm"
                            >
                              Edit
                            </Button>
                            <Button
                              onClick={() => handleDeleteTask(task._id)}
                              disabled={deleteTaskMutation.isPending && deleteTaskMutation.variables?.id === task._id}
                              variant="destructive" 
                              size="sm"
                              class='!text-white'
                            >
                              {deleteTaskMutation.isPending && deleteTaskMutation.variables?.id === task._id ? 'Deleting...' : 'Delete'}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </For>
                </TableBody>
              </Table>
            </Show>
          </Show>
        </CardContent>
      </Card>
    </div>
  );
}

function ProtectedTasksPage() {
  useAuthGuard({ requireAuth: true });
  return <TasksPageComponent />;
}

export const Route = createFileRoute('/dashboard/tasks')({
  component: ProtectedTasksPage,
  beforeLoad: () => protectedLoader(),
  loader: async ({ context: { queryClient } }) => {
    // First load the session (using cached session data)
    const sessionData = await loadSession();
    
    // Then pre-fetch tasks data
    await queryClient.ensureQueryData({
      queryKey: ['tasks'],
      queryFn: getTasks,
    });
    
    return {
      session: sessionData,
      // Tasks will be available via the query cache
    };
  },
}); 