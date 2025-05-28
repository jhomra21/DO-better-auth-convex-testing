import {
    Outlet,
    createFileRoute,
  } 
  from '@tanstack/solid-router'
  import { Suspense, Show } from 'solid-js'
  import { Transition } from 'solid-transition-group'
  import { QueryClient } from '@tanstack/solid-query'
  import {
    SidebarProvider,
    SidebarTrigger,
    SidebarInset,
  } from '~/components/ui/sidebar'
  import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip"
  import { Separator } from "~/components/ui/separator"
  import { AppSidebar } from '~/components/AppSidebar'
  import { Breadcrumbs } from '~/components/Breadcrumbs'
import { loadSession } from '~/lib/protectedRoute'
import { protectedLoader } from '~/lib/protectedRoute'
import { GlobalAuth } from '~/lib/AuthProvider'
  
  // Define router context type (can be shared or defined in a central types file too)
  export interface RouterContext {
    queryClient: QueryClient
  }
  
  // Create root route with context
  export const Route = createFileRoute('/dashboard')({
    component: DashboardPage,
    beforeLoad: () => {
      return protectedLoader();
    },
    loader: async () => {
      try {
        const session = await loadSession();
        
        // Ensure global auth state is set correctly
        if (session && session.user) {
          GlobalAuth.setIsAuthenticated(true);
          GlobalAuth.setUser(session.user);
          return session;
        } else {
          // Still return the session so the component can handle it
          return session;
        }
      } catch (error) {
        console.error('Dashboard: Error in loader', error);
        throw error;
      }
    },
  });
  
  function DashboardPage() {
    
    return (
      <div class="h-screen w-screen">
        <Show when={GlobalAuth.isAuthenticated()} 
        // fallback={
        //   <div class="h-screen w-screen flex items-center justify-center">
        //     <div class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
        //     <p class="ml-4">Verifying authentication...</p>
        //   </div>
        // }
        >
          <Transition
            onEnter={(el, done) => {
              const animation = el.animate(
                [
                  { opacity: 0 },
                  { opacity: 1 }
                ],
                { duration: 500, easing: 'ease-in' }
              );
              animation.finished.then(() => {
                done();
              });
            }}
            onExit={(el, done) => {
              const animation = el.animate(
                [
                  { opacity: 1 },
                  { opacity: 0 }
                ],
                { duration: 200, easing: 'ease-in-out' }
              );
              animation.finished.then(() => {
                done();
              });
            }}
          >
            <SidebarProvider>
              <div class="flex h-screen w-screen overflow-hidden bg-muted/40">
                <AppSidebar />
                <SidebarInset class="flex-grow overflow-hidden min-w-0 bg-background rounded-xl shadow-md transition-all duration-150 ease-in-out">
                  <header class="flex h-16 shrink-0 items-center gap-2 p-2 border-b border-gray-200 dark:border-gray-700 bg-background/95 backdrop-blur-sm sticky top-0 z-10">
                    <div class="flex items-center gap-2 px-4">
                      <Tooltip openDelay={500}>
                        <TooltipTrigger>
                          <SidebarTrigger class="-ml-1" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Toggle Sidebar</p>
                        </TooltipContent>
                      </Tooltip>
                      <Separator orientation="vertical" class="mr-2 h-4" />
                      <Breadcrumbs />
                    </div>
                  </header>
                  <div class="flex-grow overflow-y-auto p-4 relative">
                    <Suspense fallback={
                      <div class="w-full h-full flex items-center justify-center">
                        <p>Loading dashboard content...</p>
                      </div>
                    }>
                      <Transition
                        mode="outin"
                        // appear={true}
                        onEnter={(el, done) => {
                          const animation = el.animate(
                            [
                              { opacity: 0 },
                              { opacity: 1 }
                            ],
                            { duration: 300, easing: 'ease-in-out' }
                          );
                          animation.finished.then(() => {
                            done();
                          });
                        }}
                        onExit={(el, done) => {
                          const animation = el.animate(
                            [
                              { opacity: 1 },
                              { opacity: 0 }
                            ],
                            { duration: 200, easing: 'ease-in-out' }
                          );
                          animation.finished.then(() => {
                            done();
                          });
                        }} >
                          <Outlet />
                        </Transition>
                    </Suspense>
                  </div>
                </SidebarInset>
              </div>
            </SidebarProvider>
          </Transition>
        </Show>
      </div>
    );
  }
  
  