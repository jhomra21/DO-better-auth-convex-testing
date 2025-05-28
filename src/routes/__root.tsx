import {
  Outlet,
  createRootRouteWithContext,
} from '@tanstack/solid-router'
import { Suspense } from 'solid-js'
import { Transition } from 'solid-transition-group'
import { QueryClient } from '@tanstack/solid-query'
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
            { duration: 300, easing: 'ease-in' }
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
            { duration: 300, easing: 'ease-out' }
          );
          animation.finished.then(() => {
            done();
          });
        }}
      >
        <Suspense>

          {/* Simplified transition for root route - less animations to debug */}
          <Outlet />

        </Suspense></Transition>
      <TanStackRouterDevtools position="bottom-right" />
    </div>
  )
}

