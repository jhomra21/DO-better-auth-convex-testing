import { Link, useLocation } from '@tanstack/solid-router';
import { For, createMemo, children } from 'solid-js';
import { Icon, type IconName } from './ui/icon';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar
} from './ui/sidebar';
import { routeTree, type FileRoutesByFullPath } from '../routeTree.gen';
import { NavUser } from './nav-user';

const routeMetadata: Partial<Record<keyof FileRoutesByFullPath, { name: string; iconName: IconName }>> = {
  '/': { name: 'Home', iconName: 'house' },
  '/tasks': { name: 'Tasks', iconName: 'database' },
  '/database': { name: 'Database', iconName: 'server' },
  // Add more route metadata here as your application grows
};

export function AppSidebar() {
  const { setOpenMobile, isMobile, state } = useSidebar();
  const location = useLocation();
  
  const currentPath = createMemo(() => location().pathname);

  const generatedNavRoutes = createMemo(() => {
    if (!routeTree.children) {
      return [];
    }
    return Object.values(routeTree.children)
      .map(route => {
        const metadata = routeMetadata[route.id as keyof FileRoutesByFullPath];
        if (metadata) {
          return {
            path: route.id, // route.id is the full path for these routes
            name: metadata.name,
            iconName: metadata.iconName,
          };
        }
        return null;
      })
      .filter(Boolean) as { path: string; name: string; iconName: IconName }[];
  });

  const handleLinkClick = () => {
    if (isMobile()) {
      setOpenMobile(false);
    }
  };

  const renderNavItem = (route: { path: string; name: string; iconName: IconName }) => {
    const isActive = createMemo(() => currentPath() === route.path);
    
    const linkContent = createMemo(() => (
      <div class="flex items-center gap-2 relative w-full">
        <Icon 
          name={route.iconName} 
          class="h-5 w-5 absolute transition-[left] duration-[var(--sidebar-animation-duration)] ease-in-out" 
          classList={{
            "left-0": state() === "expanded",
            "-left-0.5": state() === "collapsed"
          }} 
        />
        <span 
          class="pl-7 transition-[opacity] duration-[var(--sidebar-animation-duration)] ease-in-out" 
          classList={{ 
            "opacity-0 pointer-events-none absolute": state() === "collapsed",
            "opacity-100": state() === "expanded"
          }}
        >
          {route.name}
        </span>
      </div>
    ));

    const linkChildren = children(() => linkContent());

    return (
      <SidebarMenuItem>
        <SidebarMenuButton 
          as={Link} 
          to={route.path} 
          preload="intent"
          class="w-full text-left"
          onClick={handleLinkClick}
          tooltip={route.name}
          isActive={isActive()}
        >
          {linkChildren()} 
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <For each={generatedNavRoutes()}>
                {renderNavItem}
              </For>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter class="lg:!pb-0 !px-2 !pt-2">
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
} 