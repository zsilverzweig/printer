"use client";

import { Loader2 } from "lucide-react";

import { useUserRouting } from "@/lib/hooks/use-user-routing";
import { useAuthContext } from "@/lib/providers/auth-provider";

import { MainAppSidebar } from "./ui/main-app-sidebar";
import { WelcomeSidebar } from "./ui/welcome-sidebar";

interface AppLayoutProps {
  children: React.ReactNode;
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

  // Render layout with appropriate sidebar
  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      {!isAuthenticated ? <WelcomeSidebar /> : <MainAppSidebar />}

      {/* Main content */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
