"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useUserRouting } from "@/lib/hooks/use-user-routing";
import { useAuthContext } from "@/lib/providers/auth-provider";

interface AppRouterProps {
  children?: React.ReactNode;
}

/**
 * Simplified AppRouter that only handles:
 * 1. Loading states
 * 2. Automatic redirects based on user routing logic
 * 3. Rendering children for authenticated users
 *
 * All routing logic is delegated to useUserRouting hook
 * Access control is handled by individual pages using AccessControl component
 */
export function AppRouter({ children }: AppRouterProps) {
  const { isAuthenticated, loading: authLoading } = useAuthContext();
  const { route, loading: routingLoading } = useUserRouting();
  const router = useRouter();

  // Handle automatic redirects for authenticated users
  useEffect(() => {
    if (!authLoading && !routingLoading && isAuthenticated && route) {
      const currentPath = window.location.pathname;

      // Only redirect if we're not already on the correct path
      if (currentPath !== route.path) {
        router.push(route.path);
      }
    }
  }, [isAuthenticated, authLoading, routingLoading, route, router]);

  // Show loading state while determining authentication and routing
  if (authLoading || routingLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" data-testid="loading-spinner" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Not authenticated - show welcome page (children from server component)
  if (!isAuthenticated) {
    return <>{children}</>;
  }

  // Authenticated - render children and let individual pages handle their own access control
  // The useUserRouting hook will handle redirects automatically
  return <>{children}</>;
}
