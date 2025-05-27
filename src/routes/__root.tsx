import {
  Outlet,
  createRootRouteWithContext,
  useLocation,
} from '@tanstack/solid-router'
import { Suspense, Show } from 'solid-js'
import { Transition } from 'solid-transition-group'
import { QueryClient } from '@tanstack/solid-query'
import {
  SidebarProvider,
  SidebarTrigger,
} from '~/components/ui/sidebar' // Adjusted path
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip" // Adjusted path
import { AppSidebar } from '~/components/AppSidebar' // Adjusted path
import { TanStackRouterDevtools } from '@tanstack/solid-router-devtools'

// Define router context type (can be shared or defined in a central types file too)
export interface RouterContext {
  queryClient: QueryClient
}

// Create root route with context
export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
});

function RootComponent() {
  const location = useLocation();
  
  // Check if current route is the auth route
  const isAuthRoute = () => {
    return location().pathname === '/auth';
  };

  return (

      <Transition
        appear={true}
        mode="outin"
        onEnter={(el, done) => {
          const animation = el.animate(
            [
              { opacity: 0 },
              { opacity: 1 }
            ],
            { duration: 300, easing: 'ease-in-out' }
          );
          animation.finished.then(done);
        }}
        onExit={(el, done) => {
          const animation = el.animate(
            [
              { opacity: 1 },
              { opacity: 0 }
            ],
            { duration: 200, easing: 'ease-in-out' }
          );
          animation.finished.then(done);
        }}
      >
        <Show
          when={!isAuthRoute()}
          fallback={
            <Suspense fallback={<div class="w-full h-screen flex items-center justify-center">Loading...</div>}>
              <Transition
                mode="outin"
                onEnter={(el, done) => {
                  const animation = el.animate(
                    [
                      { opacity: 0 },
                      { opacity: 1 }
                    ],
                    { duration: 300, easing: 'ease-in-out' }
                  );
                  animation.finished.then(done);
                }}
                onExit={(el, done) => {
                  const animation = el.animate(
                    [
                      { opacity: 1 },
                      { opacity: 0 }
                    ],
                    { duration: 200, easing: 'ease-in-out' }
                  );
                  animation.finished.then(done);
                }}
              >
                <Outlet />
              </Transition>
            </Suspense>
          }
        >
        
            <SidebarProvider>
              <div class="flex h-screen w-screen overflow-hidden bg-muted/40 p-2">
                <AppSidebar />
                <main 
                  class="flex flex-col mt-0.5 mr-0.5 flex-grow h-full overflow-hidden min-w-0 bg-background rounded-xl shadow-md transition-all duration-150 ease-in-out relative"
                >
                  <div class="flex-shrink-0 p-2 border-b border-gray-200 dark:border-gray-700 bg-background/95 backdrop-blur-sm flex items-center gap-x-3 sticky top-0 z-10">
                    <Tooltip openDelay={500}>
                      <TooltipTrigger>
                        <SidebarTrigger />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Toggle Sidebar</p>
                      </TooltipContent>
                    </Tooltip>
                    <div class="text-base font-semibold text-slate-700 dark:text-slate-300">
                      {(() => {
                        const currentPath = location().pathname;
                        if (currentPath === '/') {
                          return 'Home';
                        }
                        const segments = currentPath.split('/').filter(s => s.length > 0);
                        if (segments.length > 0) {
                          // Takes the first segment (e.g., "tasks" from "/tasks") and capitalizes it
                          return segments[0].charAt(0).toUpperCase() + segments[0].slice(1);
                        }
                        return 'Page'; // Default fallback if path is not "/" and has no segments
                      })()}
                    </div>
                  </div>
                  <div class="flex-grow overflow-y-auto p-4 relative">
                    <Suspense fallback={
                      <div class="w-full h-full flex items-center justify-center">
                        <p>Loading...</p>
                      </div>
                    }>
                      <Transition
                        mode="outin"
                        onEnter={(el, done) => {
                          const animation = el.animate(
                            [
                              { opacity: 0, transform: 'translateY(10px)' },
                              { opacity: 1, transform: 'translateY(0px)' }
                            ],
                            { duration: 200, easing: 'ease-in-out' }
                          );
                          animation.finished.then(done);
                        }}
                        onExit={(el, done) => {
                          const animation = el.animate(
                            [
                              { opacity: 1 },
                              { opacity: 0 }
                            ],
                            { duration: 150, easing: 'ease-in-out' }
                          );
                          animation.finished.then(done);
                        }}
                      >
                        <Outlet /> 
                      </Transition>
                    </Suspense>
                  </div>
                  
                </main>
              </div>
            </SidebarProvider>
     
        </Show> <TanStackRouterDevtools position="bottom-right" />
      </Transition>
     
    
  )
}

