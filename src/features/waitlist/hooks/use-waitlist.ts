// React hook for waitlist functionality
'use client'

import { useCallback, useEffect, useState } from 'react'

import { useAuthContext } from '@/lib/providers/auth-provider'

import { waitlistService } from '../services/waitlist-service'
import type {
    ActionTypeId,
    UseWaitlistReturn,
    WaitlistAction,
    WaitlistEntry
} from '../types'

export function useWaitlist(): UseWaitlistReturn {
  const { user, isAuthenticated } = useAuthContext()
  const [entry, setEntry] = useState<WaitlistEntry | null>(null)
  const [actions, setActions] = useState<WaitlistAction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load waitlist entry when user changes
  useEffect(() => {
    if (!isAuthenticated || !user) {
      setEntry(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    // Listen to waitlist entry changes
    const unsubscribe = waitlistService.onWaitlistEntryChange(user.uid, (newEntry) => {
      setEntry(newEntry)
      setLoading(false)
    })

    return unsubscribe
  }, [isAuthenticated, user])

  const joinWaitlist = useCallback(async (
    email: string,
    metadata?: Record<string, unknown>
  ) => {
    if (!user) {
      throw new Error('User must be authenticated to join waitlist')
    }

    try {
      setLoading(true)
      setError(null)
      
      await waitlistService.joinWaitlist(
        user.uid,
        email,
        user.displayName || undefined,
        metadata
      )
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to join waitlist'
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [user])

  const performAction = useCallback(async (
    actionType: ActionTypeId,
    metadata?: Record<string, unknown>
  ) => {
    if (!user) {
      throw new Error('User must be authenticated to perform actions')
    }

    try {
      setLoading(true)
      setError(null)
      
      await waitlistService.performAction(user.uid, actionType, metadata)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to perform action'
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [user])

  const purchaseUpgrade = useCallback(async (positions: number) => {
    if (!user) {
      throw new Error('User must be authenticated to purchase upgrades')
    }

    try {
      setLoading(true)
      setError(null)
      
      const config = await waitlistService.getWaitlistConfig()
      const amount = positions * config.paymentOptions.pricePerPosition
      
      await waitlistService.purchaseUpgrade(user.uid, positions, amount)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to purchase upgrade'
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [user])

  const refreshPosition = useCallback(async () => {
    if (!user) return

    try {
      setLoading(true)
      setError(null)
      
      const newEntry = await waitlistService.getWaitlistEntryByUserId(user.uid)
      setEntry(newEntry)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to refresh position'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }, [user])

  const availableActions = waitlistService.getAvailableActions()

  return {
    entry,
    position: entry?.position || null,
    actions,
    availableActions,
    loading,
    error,
    joinWaitlist,
    performAction,
    purchaseUpgrade,
    refreshPosition
  }
}
