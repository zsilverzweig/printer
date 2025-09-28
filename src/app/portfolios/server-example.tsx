// Example of server-side authentication with Next.js 14 App Router
import { requireAppAccess } from "@/lib/auth/server";

import { PortfoliosContent } from "./portfolios-content";

import { AccessControl } from "@/lib/components/access-control";

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
      <PortfoliosContent user={user} />
    </div>
  );
}

// Client Component for interactive features
("use client");

interface PortfoliosContentProps {
  user: {
    uid: string;
    email: string;
    displayName: string;
    status: string;
    role: string;
  };
}

export function PortfoliosContent({ user }: PortfoliosContentProps) {
  return (
    <AccessControl requiredAccess="app">
      <div className="space-y-6">
        {/* Portfolio management UI */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="p-4 border rounded-lg">
            <h3 className="font-semibold">Portfolio 1</h3>
            <p className="text-sm text-muted-foreground">$10,000</p>
          </div>
          <div className="p-4 border rounded-lg">
            <h3 className="font-semibold">Portfolio 2</h3>
            <p className="text-sm text-muted-foreground">$25,000</p>
          </div>
        </div>

        {/* Admin features for admin users */}
        {user.role === "admin" && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="font-semibold text-blue-800">Admin Features</h3>
            <p className="text-sm text-blue-600">
              Additional admin controls available
            </p>
          </div>
        )}
      </div>
    </AccessControl>
  );
}
