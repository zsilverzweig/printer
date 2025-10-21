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
      <div className="container mx-auto p-6">
        <NocTable />
      </div>
    );
  }

  // Show welcome page for unauthenticated users
  return <WelcomePage />;
}
