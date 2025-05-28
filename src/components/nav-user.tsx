import { SidebarMenuItem } from "./ui/sidebar"
import { useSidebar } from "./ui/sidebar"
import { SidebarMenu } from "./ui/sidebar"
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar"
import { Icon } from "./ui/icon"
import { SidebarMenuButton } from "./ui/sidebar"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "./ui/dropdown-menu"
import type { Component } from "solid-js"
import { Show, createMemo } from "solid-js"
import { useAuthContext } from "../lib/AuthProvider"
import { Link, useNavigate } from "@tanstack/solid-router"

export const NavUser: Component = () => {
  const { isMobile, state, setOpenMobile } = useSidebar()
  const auth = useAuthContext()
  const navigate = useNavigate()
  
  // Get user data from auth context
  const user = createMemo(() => {
    const authUser = auth.user()
    if (!authUser) return null
    
    return {
      name: authUser.name || authUser.email?.split('@')[0] || "User",
      email: authUser.email || "",
      avatar: authUser.image || ""
    }
  })

  const getInitials = (name: string) => {
    if (!name || name === "Guest") return name.charAt(0).toUpperCase() || "G";
    return name
      .split(' ')
      .map(part => part[0]?.toUpperCase() || '')
      .join('')
      .slice(0, 2) || 'U'
  }

  const isSidebarCollapsed = createMemo(() => state() === "collapsed");
  
  const handleLogout = async () => {
    if (isMobile()) {
      setOpenMobile(false);
    }
    await auth.logout()
    navigate({ to: "/" })
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem
        class="w-full"
        classList={{
          "flex justify-center items-center": isSidebarCollapsed() && !isMobile(),
        }}
      >
        <Show 
          when={auth.isAuthenticated() && user()} 
          fallback={
            <SidebarMenuButton
              as={Link}
              to="/sign-in"
              onClick={() => isMobile() && setOpenMobile(false)}
              class="w-full flex items-center justify-start gap-2 transition-[padding,width] duration-200 ease-in-out"
            >
              <Icon name="login" class="size-5" />
              <Show when={!isSidebarCollapsed() || isMobile()}>
                <span class="transition-opacity duration-200 ease-in-out"
                  classList={{
                    "opacity-0 pointer-events-none": isSidebarCollapsed() && !isMobile(),
                    "opacity-100": !isSidebarCollapsed() || isMobile(),
                  }}
                >
                  Sign In
                </span>
              </Show>
            </SidebarMenuButton>
          }
      >
        <DropdownMenu placement={isMobile() ? "top" : "right-start"}>
          <DropdownMenuTrigger class="w-full flex !rounded-xl">
            <SidebarMenuButton
              size="lg"
              class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground 
                     transition-[padding,width,scale,translate] duration-200 ease-in-out flex items-center transform translate-z-0
                     bg-gradient-to-b from-foreground/1 via-white to-foreground/1 border !border-t-foreground/2 !border-b-foreground/10 border-x-foreground/10
                     hover:shadow-md hover:shadow-foreground/5 hover:scale-102
                     active:scale-97 active:shadow-none !rounded-xl
                    "
              classList={{
                "p-1 rounded-md w-auto": isSidebarCollapsed() && !isMobile(),
                "w-full justify-start": !isSidebarCollapsed() || isMobile(),
              }}
            >
              <Avatar class="h-8 w-8 rounded-lg shrink-0 shadow-sm border border-foreground/5">
                  <Show when={user()?.avatar}>
                    <AvatarImage src={user()?.avatar} alt={user()?.name} />
                </Show>
                  <AvatarFallback class="rounded-lg">{getInitials(user()?.name || "")}</AvatarFallback>
              </Avatar>
              <Show when={!isSidebarCollapsed() || isMobile()}>
                <div class="grid flex-1 text-left text-sm leading-tight ml-2 min-w-0 transition-opacity duration-200 ease-in-out"
                  classList={{
                    "opacity-0 pointer-events-none": isSidebarCollapsed() && !isMobile(),
                    "opacity-100": !isSidebarCollapsed() || isMobile(),
                  }}
                >
                    <span class="truncate font-semibold">{user()?.name}</span>
                    <span class="truncate text-xs text-foreground/60">{user()?.email}</span>
                </div>
                <Icon name="chevronupdown" class="ml-auto size-4 shrink-0 transition-opacity duration-200 ease-in-out" 
                  classList={{
                    "opacity-0 pointer-events-none": isSidebarCollapsed() && !isMobile(),
                    "opacity-100": !isSidebarCollapsed() || isMobile(),
                  }}
                />
              </Show>
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            class={`min-w-56 rounded-lg ${isSidebarCollapsed() && !isMobile() ? "w-56" : "w-[var(--kb-menu-content-available-width)]"}`}
          >
            <DropdownMenuLabel class="p-0 font-normal">
              <div class="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar class="h-8 w-8 rounded-lg">
                    <Show when={user()?.avatar}>
                      <AvatarImage src={user()?.avatar} alt={user()?.name} />
                  </Show>
                    <AvatarFallback class="rounded-lg">{getInitials(user()?.name || "")}</AvatarFallback>
                </Avatar>
                <div class="grid flex-1 text-left text-sm leading-tight">
                    <span class="truncate font-semibold">{user()?.name}</span>
                    <span class="truncate text-xs">{user()?.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            
              <DropdownMenuGroup>
                <DropdownMenuItem>
                  <Icon name="user" class="mr-2 size-4" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Icon name="gear" class="mr-2 size-4" />
                  Settings
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>
                <Icon name="logout" class="mr-2 size-4" />
                Log out
              </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        </Show>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}