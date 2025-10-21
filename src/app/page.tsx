"use client";

import { NocTable } from "@/features/finance/market/components/noc-table";
import { WelcomePage } from "@/lib/components/welcome-page";
import { useAuthContext } from "@/lib/providers/auth-provider";

/**
 * Home page that shows:
 * - Welcome page for unauthenticated users
 * - NOC (Network Operations Center) table for authenticated users
 */
export default function HomePage() {
  const { isAuthenticated } = useAuthContext();

  // Show NOC table for authenticated users
  if (isAuthenticated) {
    return (
      <div className="w-full h-screen p-6">
        <h1 className="text-3xl font-bold mb-6">Trading Operations Center</h1>
        <NocTable />
      </div>
    );
  }

  // Show welcome page for unauthenticated users
  return <WelcomePage />;
}
