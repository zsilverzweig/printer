"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { AdminDashboard } from "@/features/admin/components/admin-dashboard";
import { WaitlistDashboard } from "@/features/waitlist/components/waitlist-dashboard";
import { useUserRouting } from "@/lib/hooks/use-user-routing";
import { useAuthContext } from "@/lib/providers/auth-provider";

interface AppRouterProps {
  children?: React.ReactNode;
}

/**
 * Lightweight centralized router that determines which content to show
 * based on authentication status and user role, while still using Next.js routing
 */
export function AppRouter({ children }: AppRouterProps) {
  const { isAuthenticated, loading: authLoading } = useAuthContext();
  const { loading: routingLoading, isAdmin, isOnWaitlist } = useUserRouting();
  const router = useRouter();

  // Handle routing for authenticated users
  useEffect(() => {
    if (!authLoading && !routingLoading && isAuthenticated) {
      const currentPath = window.location.pathname;

      // Redirect authenticated users from root to appropriate page
      if (currentPath === "/") {
        if (isAdmin) {
          router.push("/admin");
        } else if (isOnWaitlist) {
          router.push("/waitlist");
        } else {
          router.push("/home");
        }
      }
    }
  }, [
    isAuthenticated,
    authLoading,
    routingLoading,
    isAdmin,
    isOnWaitlist,
    router,
  ]);

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

  // Not authenticated - show welcome page (docs viewer)
  // The children will be the welcome page content from the server component
  if (!isAuthenticated) {
    return <>{children}</>;
  }

  // Authenticated - determine which dashboard to show based on current path
  const currentPath = window.location.pathname;

  if (isAdmin && currentPath === "/admin") {
    return <AdminDashboard />;
  }

  if (isOnWaitlist && currentPath === "/waitlist") {
    return <WaitlistDashboard />;
  }

  if (currentPath === "/home") {
    return <>{children}</>;
  }

  // Show loading while redirecting
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
        <p className="text-muted-foreground">Redirecting...</p>
      </div>
    </div>
  );
}
