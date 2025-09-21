"use client";

/**
 * UserDashboard component for authenticated users
 * Sidebar is now handled at the layout level
 */
export function UserDashboard() {
  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="prose prose-slate max-w-none">
        <h1 className="text-4xl font-bold mb-8">Printer Project</h1>
        <p className="text-xl text-muted-foreground mb-8">
          An AI-powered investment research engine that produces actionable,
          company-level investment theses through structured reasoning and
          adversarial testing.
        </p>
        <div className="mt-8 p-4 bg-muted rounded-lg">
          <h2 className="text-lg font-semibold mb-2">Welcome back!</h2>
          <p className="text-muted-foreground mb-4">
            You are logged in and can access the system.
          </p>
        </div>
      </div>
    </div>
  );
}
