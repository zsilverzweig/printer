"use client";

import { Loader2 } from "lucide-react";

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
  const { loading: routingLoading } = useUserRouting();

  // Show loading state while determining authentication and routing
  if (authLoading || routingLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // For unauthenticated users, show landing page except for auth pages
  if (!isAuthenticated) {
    const currentPath = window.location.pathname;
    const authPaths = ["/login", "/signup"];

    // Allow access to auth pages
    if (authPaths.includes(currentPath)) {
      return <>{children}</>;
    }

    // Show landing page for all other paths
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
