"use client";

import { Loader2 } from "lucide-react";

import { AISandbox } from "@/features/admin/components/ai-sandbox";
import { useAuthContext } from "@/lib/providers/auth-provider";

export default function AISandboxPage() {
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
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AI Sandbox</h1>
          <p className="text-gray-600 mt-2">
            Test and debug AI functionality including portfolio generation and
            OpenAI integration
          </p>
        </div>

        {/* AI Sandbox Component */}
        <AISandbox />
      </div>
    </div>
  );
}
