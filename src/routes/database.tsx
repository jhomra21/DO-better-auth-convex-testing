import { createFileRoute } from '@tanstack/solid-router';
import { getApiUrl } from '~/lib/utils';
import { useAuthGuard } from "~/lib/authGuard";

// Updated imports

// Define the expected shape of a user object from the API
interface User {
  id: number;
  name: string;
}

// API interaction functions
async function fetchUsers(): Promise<User[]> {
  const response = await fetch(`${getApiUrl()}/users`);
  if (!response.ok) {
    throw new Error('Network response was not ok');
  }
  return response.json();
}

// Original DatabasePage component (renamed)
function DatabasePageComponent() {
  return (
    <div class="p-4 md:p-6 lg:p-8 max-w-3xl mx-auto space-y-8">
      <h1 class="text-3xl font-bold text-center text-gray-800 dark:text-gray-200 mb-8">Data & Auth Management</h1>
      Hello World
    </div>
  );
}

// Wrapper component that applies the auth guard
function ProtectedDatabasePage() {
  useAuthGuard({ requireAuth: true });
  return <DatabasePageComponent />;
}

export const Route = createFileRoute('/database')({
  component: ProtectedDatabasePage, // Use the wrapper component
  preload: true,
});