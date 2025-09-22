// React hook for admin functionality
'use client'

import { useCallback, useEffect, useState } from 'react'

import { useAuthContext } from '@/lib/providers/auth-provider'
import { log } from '@/lib/utils/logger'

import { adminService } from '../services/admin-service'
import type {
    AdminConfig,
    UseAdminReturn,
    WaitlistStats
} from '../types'

export function useAdmin(): UseAdminReturn {
  const { user, isAdmin } = useAuthContext()
  const [config, setConfig] = useState<AdminConfig | null>(null)
  const [stats, setStats] = useState<WaitlistStats | null>(null)
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load admin data when user changes
  useEffect(() => {
    if (!isAdmin || !user) {
      setConfig(null)
      setStats(null)
      setUsers([])
      setLoading(false)
      return
    }

    loadAdminData()
  }, [isAdmin, user])

  const loadAdminData = async () => {
    if (!user) return

    try {
      setLoading(true)
      setError(null)

      const [configData, statsData, entriesData] = await Promise.all([
        adminService.getAdminConfig(),
        adminService.getWaitlistStats(),
        adminService.getAllWaitlistEntries()
      ])

      setConfig(configData)
      setStats(statsData)
      setUsers(entriesData)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load admin data'
      setError(errorMessage)
      log.error('Failed to load admin data', err, 'useAdmin')
    } finally {
      setLoading(false)
    }
  }

  const updateConfig = useCallback(async (updates: Partial<AdminConfig>) => {
    if (!user) {
      throw new Error('User must be authenticated to update config')
    }

    try {
      setLoading(true)
      setError(null)
      
      await adminService.updateAdminConfig(updates, user.uid)
      await loadAdminData() // Reload data
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update config'
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [user])

  const sendInvites = useCallback(async (count: number) => {
    if (!user) {
      throw new Error('User must be authenticated to send invites')
    }

    try {
      setLoading(true)
      setError(null)
      
      await adminService.sendInvites(count)
      await loadAdminData() // Reload data
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send invites'
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [user])

  const removeWaitlistEntry = useCallback(async (entryId: string) => {
    if (!user) {
      throw new Error('User must be authenticated to remove entries')
    }

    try {
      setLoading(true)
      setError(null)
      
      await adminService.removeWaitlistEntry(entryId)
      await loadAdminData() // Reload data
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to remove entry'
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [user])

  const updateWaitlistEntryStatus = useCallback(async (entryId: string, status: string) => {
    if (!user) {
      throw new Error('User must be authenticated to update entry status')
    }

    try {
      setLoading(true)
      setError(null)
      
      await adminService.updateWaitlistEntryStatus(entryId, status as any)
      await loadAdminData() // Reload data
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update entry status'
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [user])

  const refreshStats = useCallback(async () => {
    if (!user) return

    try {
      setError(null)
      const [statsData, entriesData] = await Promise.all([
        adminService.getWaitlistStats(),
        adminService.getAllWaitlistEntries()
      ])
      setStats(statsData)
      setUsers(entriesData)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to refresh stats'
      setError(errorMessage)
      log.error('Failed to refresh stats', err, 'useAdmin')
    }
  }, [user])

  return {
    config,
    stats,
    users,
    loading,
    error,
    updateConfig,
    sendInvites,
    removeWaitlistEntry,
    updateWaitlistEntryStatus,
    refreshStats
  }
}
