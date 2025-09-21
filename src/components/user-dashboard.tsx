'use client'

import { useUserRouting } from '@/lib/hooks/use-user-routing'
import { useAuthContext } from '@/lib/providers/auth-provider'

/**
 * Simplified UserDashboard component that just shows home page content for authenticated users
 * Routing logic is now handled centrally by AppRouter
 */
export function UserDashboard() {
  const { isAuthenticated } = useAuthContext()
  const { isAdmin, isOnWaitlist } = useUserRouting()

  // This component is only rendered for authenticated users who are not admin or on waitlist
  // So we can safely assume we're showing the home page content
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="prose prose-slate max-w-none">
          <h1 className="text-4xl font-bold mb-8">Printer Project</h1>
          <p className="text-xl text-muted-foreground mb-8">
            An AI-powered investment research engine that produces actionable, company-level investment theses through structured reasoning and adversarial testing.
          </p>
          <div className="mt-8 p-4 bg-muted rounded-lg">
            <h2 className="text-lg font-semibold mb-2">Welcome back!</h2>
            <p className="text-muted-foreground mb-4">
              You are logged in and can access the system.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
