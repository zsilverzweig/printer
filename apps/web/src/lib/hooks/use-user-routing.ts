// Hook for determining user routing based on authentication and role
"use client";

import { useCallback } from "react";

import { useUser } from "@/lib/hooks/use-user";
import { UserAccess } from "@/lib/types/user";

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
  access: UserAccess | null;
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

    // Admin users get redirected to Portfolios page by default
    if (isAdmin) {
      return {
        path: "/portfolios",
        reason: "Admin user - redirecting to portfolios page",
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
        path: "/portfolios",
        reason: "Active user - redirecting to portfolios page",
      };
    }

    // For pending users, redirect to signup info page to complete profile
    return {
      path: "/signup-info",
      reason: "Pending user - redirecting to complete profile setup",
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
