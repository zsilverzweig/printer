import { TickerDatabaseManagement } from "@/features/admin/components/ticker-database-management";
import { requireAdmin } from "@/lib/auth/server";

/**
 * Market Data Management Page
 *
 * Server Component that checks admin authentication before rendering
 * the client-side market data management interface.
 */
export default async function MarketDataPage() {
  // Server-side admin check
  await requireAdmin();

  return <TickerDatabaseManagement />;
}
