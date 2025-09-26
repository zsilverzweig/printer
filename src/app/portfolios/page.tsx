import { PortfolioManagement } from "@/features/finance/portfolio/components/portfolio-management";
import { requireAppAccess } from "@/lib/auth/server";

/**
 * Server Component - runs on the server before page renders
 *
 * Benefits:
 * - Authentication check happens on server
 * - No flash of protected content
 * - Better SEO
 * - Faster page loads
 * - More secure
 */
export default async function PortfoliosPage() {
  // This runs on the server and redirects if user doesn't have access
  const user = await requireAppAccess();

  // If we reach here, user is authenticated and has app access
  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Portfolios</h1>
      <p className="text-muted-foreground mb-6">
        Welcome back, {user.displayName}!
      </p>

      {/* Pass user data to client component */}
      <PortfolioManagement userId={user.uid} />
    </div>
  );
}
