// Hook for determining user routing based on authentication and role
'use client'

import { waitlistService } from '@/features/waitlist/services/waitlist-service'
import type { WaitlistEntry } from '@/features/waitlist/types'
import { useAuthContext } from '@/lib/providers/auth-provider'
import { useCallback, useEffect, useState } from 'react'

export interface UserRoute {
  path: string
  reason: string
}

export interface UseUserRoutingReturn {
  route: UserRoute | null
  loading: boolean
  error: string | null
  isAdmin: boolean
  isOnWaitlist: boolean
  waitlistEntry: WaitlistEntry | null
}

export function useUserRouting(): UseUserRoutingReturn {
  const { user, isAuthenticated, isAdmin } = useAuthContext()
  const [waitlistEntry, setWaitlistEntry] = useState<WaitlistEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load waitlist entry when user changes
  useEffect(() => {
    if (!isAuthenticated || !user) {
      setWaitlistEntry(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    // Listen to waitlist entry changes
    const unsubscribe = waitlistService.onWaitlistEntryChange(user.uid, (newEntry) => {
      setWaitlistEntry(newEntry)
      setLoading(false)
    })

    return unsubscribe
  }, [isAuthenticated, user])

  const determineRoute = useCallback((): UserRoute | null => {
    if (!isAuthenticated || !user) {
      return null
    }

    // Admin users go to admin dashboard
    if (isAdmin) {
      return {
        path: '/admin',
        reason: 'Admin user - redirecting to admin dashboard'
      }
    }

    // Check if user is on waitlist
    if (waitlistEntry) {
      return {
        path: '/waitlist',
        reason: 'User is on waitlist - redirecting to waitlist dashboard'
      }
    }

    // Default authenticated users go to home page
    return {
      path: '/',
      reason: 'Authenticated user - redirecting to home page'
    }
  }, [isAuthenticated, user, isAdmin, waitlistEntry])

  const route = determineRoute()
  const isOnWaitlist = waitlistEntry !== null

  return {
    route,
    loading,
    error,
    isAdmin,
    isOnWaitlist,
    waitlistEntry
  }
}
