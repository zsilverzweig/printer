"use client";

/**
 * AppLayout Component
 * 
 * PURPOSE: Manages UI layout decisions based on authentication state and current route.
 * 
 * ROLE IN ARCHITECTURE:
 * - Middleware handles: Route protection and redirects (server-side)
 * - AppLayout handles: UI layout decisions (client-side)
 * 
 * KEY RESPONSIBILITIES:
 * 1. Auth pages: Always render children (login, signup, etc.)
 * 2. Loading states: Show spinner only for authenticated users loading data
 * 3. Layout switching: Landing page vs App with sidebar
 * 
 * AUTH PAGE HANDLING:
 * - Auth pages bypass loading states to prevent login page from being blocked
 * - Includes: /login, /signup, /signup-info, /waitlist, /waitlist-signup
 * 
 * LAYOUT TYPES:
 * - Unauthenticated + non-auth page: LandingPage component
 * - Authenticated: App with sidebar (SidebarProvider + MainAppSidebar)
 * - Auth pages: Direct children rendering
 */

import { Loader2 } from "lucide-react";
import { usePathname } from "next/navigation";

import { useUserRouting } from "@/lib/hooks/use-user-routing";
import { useAuthContext } from "@/lib/providers/auth-provider";

import { LandingPage } from "./landing-page";
import { MainAppSidebar } from "./ui/main-app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "./ui/sidebar";

interface AppLayoutProps {
  children: React.ReactNode;
}

// Floating sidebar trigger that only appears when sidebar is collapsed
function FloatingSidebarTrigger() {
  const { state } = useSidebar();

  // Only show when sidebar is collapsed
  if (state !== "collapsed") {
    return null;
  }

  return (
    <div className="fixed top-4 left-4 z-50">
      <SidebarTrigger className="h-10 w-10 shadow-lg" />
    </div>
  );
}

export function AppLayout({ children }: AppLayoutProps) {
  const { isAuthenticated, loading: authLoading } = useAuthContext();
  const currentPath = usePathname();

  // Check if we're on an auth page that should always be accessible
  const authPaths = ["/login", "/signup", "/signup-info", "/waitlist", "/waitlist-signup"];
  const isAuthPage = authPaths.includes(currentPath);

  // For auth pages, always allow access - middleware handles routing
  if (isAuthPage) {
    return <>{children}</>;
  }

  // Show loading state only for authenticated users loading their data
  if (authLoading && isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // For unauthenticated users on non-auth pages, show landing page
  if (!isAuthenticated) {
    return <LandingPage />;
  }

  // For authenticated users, show app with sidebar
  return (
    <SidebarProvider>
      <MainAppSidebar />
      <SidebarInset className="bg-background">
        <FloatingSidebarTrigger />
        <div className="flex-1 overflow-auto">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
