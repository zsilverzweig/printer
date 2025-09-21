// React hook for admin configuration management
'use client'

import { useAuthContext } from '@/lib/providers/auth-provider'
import { useCallback, useEffect, useState } from 'react'
import { adminService } from '../services/admin-service'
import type {
    AdminConfig,
    UseAdminConfigReturn
} from '../types'

export function useAdminConfig(): UseAdminConfigReturn {
  const { user, isAdmin } = useAuthContext()
  const [config, setConfig] = useState<AdminConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load config when user changes
  useEffect(() => {
    if (!isAdmin || !user) {
      setConfig(null)
      setLoading(false)
      return
    }

    loadConfig()
  }, [isAdmin, user])

  const loadConfig = async () => {
    if (!user) return

    try {
      setLoading(true)
      setError(null)
      const configData = await adminService.getAdminConfig()
      setConfig(configData)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load config'
      setError(errorMessage)
      console.error('Failed to load admin config:', err)
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
      await loadConfig() // Reload config
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update config'
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [user])

  const toggleWaitlist = useCallback(async () => {
    if (!user) {
      throw new Error('User must be authenticated to toggle waitlist')
    }

    try {
      setLoading(true)
      setError(null)
      
      await adminService.toggleWaitlist(user.uid)
      await loadConfig() // Reload config
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to toggle waitlist'
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [user])

  const toggleAutoAdd = useCallback(async () => {
    if (!user) {
      throw new Error('User must be authenticated to toggle auto-add')
    }

    try {
      setLoading(true)
      setError(null)
      
      await adminService.toggleAutoAddToWaitlist(user.uid)
      await loadConfig() // Reload config
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to toggle auto-add'
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [user])

  return {
    config,
    loading,
    error,
    updateConfig,
    toggleWaitlist,
    toggleAutoAdd
  }
}
