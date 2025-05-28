import { createQuery, createMutation, useQueryClient } from '@tanstack/solid-query';
import { notesAPI } from './notesAPI';

export const useNotesQuery = () => {
  return createQuery(() => ({
    queryKey: ['notes'],
    queryFn: () => notesAPI.getNotes(),
  }));
};

export const useCreateNoteMutation = () => {
  const queryClient = useQueryClient();
  
  return createMutation(() => ({
    mutationFn: (text: string) => notesAPI.createNote(text),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
    },
  }));
};

export const useUpdateNoteMutation = () => {
  const queryClient = useQueryClient();
  
  return createMutation(() => ({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      notesAPI.updateNote(id, text),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
    },
    onError: (error) => {
      console.error('Failed to update note:', error);
    }
  }));
};

export const useDeleteNoteMutation = () => {
  const queryClient = useQueryClient();
  
  return createMutation(() => ({
    mutationFn: (id: string) => notesAPI.deleteNote(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
    },
    onError: (error) => {
      console.error('Failed to delete note:', error);
    }
  }));
}; 