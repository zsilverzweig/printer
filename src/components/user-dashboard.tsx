'use client'

import { AdminDashboard } from '@/features/admin/components/admin-dashboard'
import { WaitlistDashboard } from '@/features/waitlist/components/waitlist-dashboard'
import { useUserRouting } from '@/lib/hooks/use-user-routing'
import { useAuthContext } from '@/lib/providers/auth-provider'
import { log } from '@/lib/utils/logger'
import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export function UserDashboard() {
  const { isAuthenticated, loading: authLoading } = useAuthContext()
  const { route, loading: routingLoading, isAdmin, isOnWaitlist, waitlistEntry } = useUserRouting()
  const router = useRouter()

  // Handle routing when route is determined
  useEffect(() => {
    if (!authLoading && !routingLoading && route) {
      log.info('User routing determined', { 
        route: route.path, 
        reason: route.reason,
        isAdmin,
        isOnWaitlist 
      }, 'UserDashboard')
      
      // Only redirect if we're not already on the correct page
      if (window.location.pathname !== route.path) {
        router.push(route.path)
      }
    }
  }, [route, authLoading, routingLoading, router, isAdmin, isOnWaitlist])

  // Show loading state while determining authentication and routing
  if (authLoading || routingLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  // If not authenticated, redirect to login
  if (!isAuthenticated) {
    router.push('/login')
    return null
  }

  // Render appropriate dashboard based on user role and current path
  const currentPath = window.location.pathname

  // Admin dashboard
  if (isAdmin && currentPath === '/admin') {
    return <AdminDashboard />
  }

  // Waitlist dashboard
  if (isOnWaitlist && currentPath === '/waitlist') {
    return <WaitlistDashboard />
  }

  // Home page (default for authenticated users)
  if (currentPath === '/' || currentPath === '') {
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
                {isAdmin ? 'You have admin access to the system.' : 
                 isOnWaitlist ? 'You are on the waitlist.' : 
                 'You are logged in and can access the system.'}
              </p>
              <div className="flex gap-4">
                {isAdmin && (
                  <button
                    onClick={() => router.push('/admin')}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                  >
                    Go to Admin Dashboard
                  </button>
                )}
                {isOnWaitlist && (
                  <button
                    onClick={() => router.push('/waitlist')}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                  >
                    Go to Waitlist Dashboard
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Fallback - redirect to determined route
  if (route && currentPath !== route.path) {
    router.push(route.path)
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Redirecting...</p>
        </div>
      </div>
    )
  }

  // Default fallback
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <p className="text-muted-foreground">Loading dashboard...</p>
      </div>
    </div>
  )
}
