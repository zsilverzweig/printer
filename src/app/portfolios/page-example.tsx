// Example of how to use the new routing approach
"use client";

import { useUserRouting } from "@/lib/hooks/use-user-routing";

import { AccessControl } from "@/lib/components/access-control";

export default function PortfoliosPage() {
  const { isAdmin, canAccessApp } = useUserRouting();

  return (
    <AccessControl requiredAccess="app">
      <div className="container mx-auto p-6">
        <h1 className="text-2xl font-bold mb-4">Portfolios</h1>
        <p>Your portfolio management dashboard</p>

        {/* Page content here */}
        <div className="mt-4">
          {isAdmin && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-blue-800">Admin features available</p>
            </div>
          )}
        </div>
      </div>
    </AccessControl>
  );
}
