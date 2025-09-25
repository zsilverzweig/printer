"use client";

import { AlertCircle, Shield } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import { useUserRouting } from "@/lib/hooks/use-user-routing";

interface AccessControlProps {
  children: React.ReactNode;
  requiredAccess?: "app" | "waitlist" | "admin";
  fallbackComponent?: React.ReactNode;
}

/**
 * AccessControl component that can be used by individual pages
 * to enforce access restrictions with proper UI feedback
 */
export function AccessControl({
  children,
  requiredAccess = "app",
  fallbackComponent,
}: AccessControlProps) {
  const { isAdmin, isOnWaitlist, canAccessApp, access } = useUserRouting();
  const router = useRouter();

  // Check if user has required access
  const hasAccess = (() => {
    switch (requiredAccess) {
      case "admin":
        return isAdmin;
      case "waitlist":
        return isOnWaitlist || canAccessApp || isAdmin;
      case "app":
        return canAccessApp || isAdmin;
      default:
        return false;
    }
  })();

  // If user has access, render children
  if (hasAccess) {
    return <>{children}</>;
  }

  // If custom fallback provided, use it
  if (fallbackComponent) {
    return <>{fallbackComponent}</>;
  }

  // Default access denied UI
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-orange-100">
            <Shield className="h-6 w-6 text-orange-600" />
          </div>
          <CardTitle>Access Restricted</CardTitle>
          <CardDescription>
            {requiredAccess === "admin"
              ? "Admin access required for this page."
              : "Your account doesn't have access to this feature yet."}
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
                    <li key={index} className="flex items-center gap-2 text-sm">
                      <AlertCircle className="h-4 w-4 text-orange-500" />
                      {restriction}
                    </li>
                  )
                )}
              </ul>
            </div>
          )}

          <div className="flex gap-2">
            {isOnWaitlist ? (
              <Button
                onClick={() => router.push("/waitlist")}
                className="flex-1"
              >
                Go to Waitlist Dashboard
              </Button>
            ) : (
              <Button
                onClick={() => router.push("/waitlist")}
                variant="outline"
                className="flex-1"
              >
                Join Waitlist
              </Button>
            )}
            <Button onClick={() => router.push("/")} variant="outline">
              Go Home
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
