"use client";

import { createContext, ReactNode, useContext } from "react";

import type { ServerUser } from "@/lib/auth/server";
import { useAuth, UseAuthReturn } from "@/lib/hooks/use-auth";

interface AuthContextType extends UseAuthReturn {}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
  initialUser?: ServerUser | null;
}

export function AuthProvider({ children, initialUser }: AuthProviderProps) {
  const auth = useAuth(initialUser);
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuthContext must be used within an AuthProvider");
  }
  return context;
}
