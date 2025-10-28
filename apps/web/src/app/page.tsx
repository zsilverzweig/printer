"use client";

import { NocTable } from "@/features/finance/market/components/noc-table";
import { WelcomePage } from "@/lib/components/welcome-page";
import { useAuthContext } from "@/lib/providers/auth-provider";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

/**
 * Home page content with URL parameter support
 */
function HomePageContent() {
  const { isAuthenticated } = useAuthContext();
  const searchParams = useSearchParams();
  const tickerFromUrl = searchParams.get("ticker");

  // Show TCC for authenticated users
  if (isAuthenticated) {
    return (
      <div className="w-full h-screen flex flex-col overflow-hidden">
        <h1 className="text-3xl font-bold px-6 pt-6 pb-4">
          Trading Command Center
        </h1>
        <div className="flex-1 min-h-0 px-6 pb-6">
          <NocTable initialTicker={tickerFromUrl || undefined} />
        </div>
      </div>
    );
  }

  // Show welcome page for unauthenticated users
  return <WelcomePage />;
}

/**
 * Home page that shows:
 * - Welcome page for unauthenticated users
 * - TCC (Trading Command Center) for authenticated users
 */
export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="w-full h-screen p-6 flex items-center justify-center">
          Loading...
        </div>
      }
    >
      <HomePageContent />
    </Suspense>
  );
}
