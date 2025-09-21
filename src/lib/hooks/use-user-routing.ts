// Hook for determining user routing based on authentication and role
"use client";

import { useUser } from "@/lib/hooks/use-user";
import { useCallback } from "react";

export interface UserRoute {
  path: string;
  reason: string;
}

export interface UseUserRoutingReturn {
  route: UserRoute | null;
  loading: boolean;
  error: string | null;
  isAdmin: boolean;
  isOnWaitlist: boolean;
  canAccessApp: boolean;
  access: any;
}

export function useUserRouting(): UseUserRoutingReturn {
  const {
    user,
    isAuthenticated,
    isAdmin,
    loading,
    error,
    isOnWaitlist,
    canAccessApp,
    access,
  } = useUser();

  const determineRoute = useCallback((): UserRoute | null => {
    if (!isAuthenticated || !user) {
      return null;
    }

    // Admin users go to admin dashboard
    if (isAdmin) {
      return {
        path: "/admin",
        reason: "Admin user - redirecting to admin dashboard",
      };
    }

    // Check if user is on waitlist
    if (isOnWaitlist) {
      return {
        path: "/waitlist",
        reason: "User is on waitlist - redirecting to waitlist dashboard",
      };
    }

    // Check if user has active access
    if (canAccessApp) {
      return {
        path: "/home",
        reason: "Active user - redirecting to home page",
      };
    }

    // User doesn't have access - redirect to waitlist or show restrictions
    return {
      path: "/waitlist",
      reason: "User access restricted - redirecting to waitlist",
    };
  }, [isAuthenticated, user, isAdmin, isOnWaitlist, canAccessApp]);

  const route = determineRoute();

  return {
    route,
    loading,
    error,
    isAdmin,
    isOnWaitlist,
    canAccessApp,
    access,
  };
}
