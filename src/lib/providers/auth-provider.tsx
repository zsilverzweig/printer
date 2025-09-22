"use client";

import { createContext, ReactNode, useContext } from "react";

import { useAuth, UseAuthReturn } from "@/lib/hooks/use-auth";

interface AuthContextType extends UseAuthReturn {}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  console.log("[PERF] AuthProvider rendering at:", new Date().toISOString());

  const auth = useAuth();

  console.log("[PERF] AuthProvider auth state:", {
    isAuthenticated: auth.isAuthenticated,
    loading: auth.loading,
    user: auth.user ? "present" : "null",
  });

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuthContext must be used within an AuthProvider");
  }
  return context;
}
