"use client";

import { Loader2 } from "lucide-react";

import { AgentManagement } from "@/features/ai/agents/components/agent-management";
import { useAuthContext } from "@/lib/providers/auth-provider";

export default function AdminAgentsPage() {
  const { isAuthenticated, isAdmin, loading } = useAuthContext();

  // Show loading state while determining authentication
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Check if user is authenticated and is admin
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Authentication Required</h1>
          <p className="text-muted-foreground">
            Please sign in to access this page.
          </p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
          <p className="text-muted-foreground">
            You don&apos;t have permission to access this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <AgentManagement />
    </div>
  );
}
