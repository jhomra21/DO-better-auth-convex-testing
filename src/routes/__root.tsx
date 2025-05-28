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
  SidebarInset,
} from '~/components/ui/sidebar' // Added SidebarInset import
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip"
import { Separator } from "~/components/ui/separator" // Added Separator import
import { AppSidebar } from '~/components/AppSidebar'
import { TanStackRouterDevtools } from '@tanstack/solid-router-devtools'
import { Breadcrumbs } from '~/components/Breadcrumbs'

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
<div class="h-screen w-screen">
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
                </SidebarInset>
              </div>
            </SidebarProvider>
     
        </Show> <TanStackRouterDevtools position="bottom-right" />
      </Transition>
     </div>
    
  )
}

