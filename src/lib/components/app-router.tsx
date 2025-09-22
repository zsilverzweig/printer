"use client";

import { AlertCircle, Loader2, Shield } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { WaitlistDashboard } from "@/features/waitlist/components/waitlist-dashboard";
import { Button } from "@/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import { useUserRouting } from "@/lib/hooks/use-user-routing";
import { useAuthContext } from "@/lib/providers/auth-provider";

interface AppRouterProps {
  children?: React.ReactNode;
}

/**
 * Centralized router that enforces waitlist status and determines which content to show
 * based on authentication status, user role, and access permissions
 */
export function AppRouter({ children }: AppRouterProps) {
  const { isAuthenticated, loading: authLoading } = useAuthContext();
  const {
    loading: routingLoading,
    isAdmin,
    isOnWaitlist,
    canAccessApp,
    access,
    route,
  } = useUserRouting();
  const router = useRouter();

  // Handle routing for authenticated users
  useEffect(() => {
    if (!authLoading && !routingLoading && isAuthenticated && route) {
      const currentPath = window.location.pathname;

      // Don't redirect admin users - they can access any page
      if (isAdmin) {
        return;
      }

      // Redirect if user is not on the correct path
      if (currentPath !== route.path) {
        router.push(route.path);
      }
    }
  }, [isAuthenticated, authLoading, routingLoading, route, router, isAdmin]);

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

  // Admin users - allow access to ANY page (admin, portfolios, home, etc.)
  if (isAdmin) {
    return <>{children}</>;
  }

  // Waitlist users - allow access to waitlist dashboard
  if (isOnWaitlist && currentPath === "/waitlist") {
    return <WaitlistDashboard />;
  }

  // Active users - allow access to authenticated pages
  const allowedPaths = ["/home", "/portfolios", "/login"];
  if (canAccessApp && allowedPaths.includes(currentPath)) {
    return <>{children}</>;
  }

  // Allow authenticated users to access content pages (markdown docs, etc.)
  // but not admin pages unless they're admin
  if (
    isAuthenticated &&
    currentPath !== "/admin" &&
    !currentPath.startsWith("/admin/") &&
    !currentPath.startsWith("/api/")
  ) {
    return <>{children}</>;
  }

  // Access denied - show restrictions
  if (!canAccessApp && isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-orange-100">
              <Shield className="h-6 w-6 text-orange-600" />
            </div>
            <CardTitle>Access Restricted</CardTitle>
            <CardDescription>
              Your account doesn&apos;t have access to the full application yet.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {access?.restrictions && access.restrictions.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">
                  Current Status:
                </h4>
                <ul className="space-y-1">
                  {access.restrictions.map(
                    (restriction: string, index: number) => (
                      <li
                        key={index}
                        className="flex items-center gap-2 text-sm"
                      >
                        <AlertCircle className="h-4 w-4 text-orange-500" />
                        {restriction}
                      </li>
                    )
                  )}
                </ul>
              </div>
            )}

            {isOnWaitlist ? (
              <Button
                onClick={() => router.push("/waitlist")}
                className="w-full"
              >
                Go to Waitlist Dashboard
              </Button>
            ) : (
              <Button
                onClick={() => router.push("/waitlist")}
                variant="outline"
                className="w-full"
              >
                Join Waitlist
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
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
