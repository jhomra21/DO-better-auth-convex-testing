import { createFileRoute, Link, useNavigate } from '@tanstack/solid-router';
import { For, createMemo, children } from 'solid-js';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '~/components/ui/card';
import { Button } from '~/components/ui/button';
import { useAuthContext } from '~/lib/AuthProvider';
import Footer from '~/components/Footer';
import { Route as DashboardRoute } from '../dashboard';


export function DashboardIndex() {
  const sessionData = DashboardRoute.useLoaderData();
  const user = () => sessionData()?.user;
  const auth = useAuthContext();
  const navigate = useNavigate();
  const dashboardItems = [
    {
      title: 'Notes',
      description: 'Your personal notes with real-time sync',
      icon: '📝',
      path: '/dashboard/notes',
      color: 'border-blue-200 dark:border-blue-800'
    },
    {
      title: 'Database',
      description: 'Manage your database records',
      icon: '🗄️',
      path: '/dashboard/database',
      color: 'border-green-200 dark:border-green-800'
    },
    {
      title: 'Tasks',
      description: 'Track and manage your tasks',
      icon: '✅',
      path: '/dashboard/tasks',
      color: 'border-purple-200 dark:border-purple-800'
    }
  ];

  const renderCard = (item: typeof dashboardItems[0]) => {
    // Pre-compute the button content using createMemo
    const buttonContent = createMemo(() => (
      <>Open {item.title}</>
    ));

    // Use children helper to create a stable child function
    const buttonChildren = children(() => buttonContent());

    return (
      <Card class={`overflow-hidden transition-all hover:shadow-sm border-l-2 ${item.color} bg-card`}>
        <div class="p-5">
          <div class="flex justify-between items-center mb-3">
            <CardTitle class="text-lg font-medium">{item.title}</CardTitle>
            <span class="text-2xl">{item.icon}</span>
          </div>
          <CardDescription class="text-sm text-muted-foreground mb-4">
            {item.description}
          </CardDescription>
          <div class="flex justify-start">
            <Button 
              variant="sf-compute"
              size="sm"
              as={Link}
              to={item.path}
              preload="intent"
              class="font-normal"
            >
              {buttonChildren()}
            </Button>
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div class="container py-8 px-4 mx-auto max-w-5xl flex flex-col min-h-screen">
      <div class="flex-grow">
        <div class="mb-10">
          <h1 class="text-2xl font-semibold mb-2">Welcome, {user()?.name || 'User'}</h1>
          <p class="text-muted-foreground text-sm">
            Each user gets their own isolated database via Durable Objects
          </p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <For each={dashboardItems}>
            {renderCard}
          </For>
        </div>

        <Card class="mt-12 bg-card/50">
          <CardHeader>
            <CardTitle class="text-base font-medium">About This Demo</CardTitle>
            <CardDescription>
              This application demonstrates integration of several technologies:
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul class="space-y-2 text-sm text-muted-foreground">
              <li class="flex items-center gap-2">
                <div class="h-1 w-1 rounded-full bg-muted-foreground"></div>
                Better-auth with Drizzle ORM and D1 Cloudflare for authentication
              </li>
              <li class="flex items-center gap-2">
                <div class="h-1 w-1 rounded-full bg-muted-foreground"></div>
                Durable Objects providing isolated databases per user
              </li>
              <li class="flex items-center gap-2">
                <div class="h-1 w-1 rounded-full bg-muted-foreground"></div>
                Real-time updates via WebSockets
              </li>
              <li class="flex items-center gap-2">
                <div class="h-1 w-1 rounded-full bg-muted-foreground"></div>
                SolidJS and Tanstack Router for reactive UI
              </li>
            </ul>
          </CardContent>
          <CardFooter>
            <Button variant="sf-compute" onClick={async () => {
              await auth.logout()
              navigate({ to: "/" })
            }}>
              Logout
            </Button>
          </CardFooter>
        </Card>
      </div>
      
      <Footer />
    </div>
  );
}

export const Route = createFileRoute('/dashboard/')({
  component: DashboardIndex,
}); 