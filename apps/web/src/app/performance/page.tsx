/**
 * Performance Management Page Route
 *
 * Dedicated page for comprehensive trade analytics and performance visualization.
 */

"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { PerformanceManagementPage } from "@/features/finance/funds/components/performance-management-page";
import { fundService } from "@/features/finance/funds/services/fund-service";
import { Fund } from "@/features/finance/funds/types";
import { useAuthContext } from "@/lib/providers/auth-provider";

export default function PerformancePage() {
  const { isAuthenticated, loading: authLoading } = useAuthContext();
  const [funds, setFunds] = useState<Fund[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadFunds = async () => {
      try {
        setLoading(true);
        const fundsList = await fundService.getFunds();
        setFunds(fundsList);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load funds");
      } finally {
        setLoading(false);
      }
    };

    if (isAuthenticated) {
      void loadFunds();
    }
  }, [isAuthenticated]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading performance data...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Authentication Required</h1>
          <p className="text-muted-foreground">
            Please sign in to access performance management.
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4 text-red-600">Error</h1>
          <p className="text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return <PerformanceManagementPage funds={funds} />;
}
