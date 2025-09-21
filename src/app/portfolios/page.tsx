"use client";

import { PortfolioManagement } from "@/features/ai/agents/components/portfolio-management";
import { useAuthContext } from "@/lib/providers/auth-provider";
import { Loader2 } from "lucide-react";

export default function PortfoliosPage() {
  const { isAuthenticated, user, loading } = useAuthContext();

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

  // Check if user is authenticated
  if (!isAuthenticated || !user) {
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

  return (
    <div className="container mx-auto p-6">
      <PortfolioManagement userId={user.uid} />
    </div>
  );
}
