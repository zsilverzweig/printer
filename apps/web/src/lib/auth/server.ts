import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Server-side authentication utilities for Next.js 14 App Router
 *
 * These functions run on the server and provide:
 * - User state without client-side JavaScript
 * - Server-side redirects
 * - Secure cookie handling
 */

export interface ServerUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  status: "pending" | "active" | "invited" | "suspended" | "banned";
  role: "user" | "admin" | "super_admin";
}

/**
 * Get user from server-side cookies
 * This runs on the server and doesn't require client-side JavaScript
 */
export async function getServerUser(): Promise<ServerUser | null> {
  try {
    const cookieStore = await cookies();

    // Get user data from cookies (set by auth service)
    const userCookie = cookieStore.get("user-data");
    const authToken = cookieStore.get("auth-token");

    if (!authToken || !userCookie) {
      return null;
    }

    // Parse user data from cookie
    const userData = JSON.parse(userCookie.value);

    return {
      uid: userData.uid,
      email: userData.email,
      displayName: userData.displayName,
      photoURL: userData.photoURL,
      status: userData.status,
      role: userData.role,
    };
  } catch (error) {
    console.error("Error getting server user:", error);
    return null;
  }
}

/**
 * Require authentication - redirect to login if not authenticated
 */
export async function requireAuth(): Promise<ServerUser> {
  const user = await getServerUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

/**
 * Require admin access - redirect if not admin
 */
export async function requireAdmin(): Promise<ServerUser> {
  const user = await requireAuth();

  if (user.role !== "admin" && user.role !== "super_admin") {
    redirect("/unauthorized");
  }

  return user;
}

/**
 * Require app access - redirect based on user status
 */
export async function requireAppAccess(): Promise<ServerUser> {
  const user = await requireAuth();

  // Handle different user statuses
  switch (user.status) {
    case "pending":
      redirect("/signup-info");
    case "suspended":
    case "banned":
      redirect("/account-suspended");
    case "active":
    case "invited":
      return user;
    default:
      redirect("/login");
  }
}

/**
 * Get user status for conditional rendering
 */
export async function getUserStatus(): Promise<{
  isAuthenticated: boolean;
  isAdmin: boolean;
  canAccessApp: boolean;
  user: ServerUser | null;
}> {
  const user = await getServerUser();

  if (!user) {
    return {
      isAuthenticated: false,
      isAdmin: false,
      canAccessApp: false,
      user: null,
    };
  }

  const isAdmin = user.role === "admin" || user.role === "super_admin";
  const canAccessApp = user.status === "active" || user.status === "invited";

  return {
    isAuthenticated: true,
    isAdmin,
    canAccessApp,
    user,
  };
}

/**
 * Set user data in cookies (called by auth service)
 */
export async function setServerUser(user: ServerUser, authToken: string) {
  const cookieStore = await cookies();

  // Set auth token
  cookieStore.set("auth-token", authToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  // Set user data
  cookieStore.set("user-data", JSON.stringify(user), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  // Set individual fields for middleware
  cookieStore.set("user-role", user.role, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
  });

  cookieStore.set("user-status", user.status, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
  });
}

/**
 * Clear user data from cookies (logout)
 */
export async function clearServerUser() {
  const cookieStore = await cookies();

  cookieStore.delete("auth-token");
  cookieStore.delete("user-data");
  cookieStore.delete("user-role");
  cookieStore.delete("user-status");
}
