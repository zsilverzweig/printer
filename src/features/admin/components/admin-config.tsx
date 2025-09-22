'use client'

import {
    RefreshCw,
    Save,
    Shield,
    Users
} from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/lib/components/ui/button'
import { Card } from '@/lib/components/ui/card'
import { Input } from '@/lib/components/ui/input'
import { Switch } from '@/lib/components/ui/switch'
import { log } from '@/lib/utils/logger'

import { useAdminConfig } from '../hooks/use-admin-config'

export function AdminConfig() {
  const { 
    config, 
    loading, 
    error, 
    updateConfig, 
    toggleWaitlist, 
    toggleAutoAdd 
  } = useAdminConfig()
  
  const [isUpdating, setIsUpdating] = useState(false)
  const [localConfig, setLocalConfig] = useState({
    waitlistCapacity: 1000,
    inviteBatchSize: 10
  })

  // Update local config when config loads
  useState(() => {
    if (config) {
      setLocalConfig({
        waitlistCapacity: config.waitlistCapacity || 1000,
        inviteBatchSize: config.inviteBatchSize
      })
    }
  })

  const handleSave = async () => {
    if (!config) return

    try {
      setIsUpdating(true)
      await updateConfig(localConfig)
    } catch (err) {
      log.error('Failed to update config', err, 'AdminConfig')
    } finally {
      setIsUpdating(false)
    }
  }

  const handleToggleWaitlist = async () => {
    try {
      await toggleWaitlist()
    } catch (err) {
      log.error('Failed to toggle waitlist', err, 'AdminConfig')
    }
  }

  const handleToggleAutoAdd = async () => {
    try {
      await toggleAutoAdd()
    } catch (err) {
      log.error('Failed to toggle auto-add', err, 'AdminConfig')
    }
  }

  if (loading && !config) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading configuration...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    )
  }

  if (!config) {
    return (
      <div className="p-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
          <p className="text-yellow-600">No configuration found</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Admin Configuration</h1>
          <p className="text-gray-600 mt-1">Manage system settings and waitlist configuration</p>
        </div>
        <div className="flex items-center space-x-2 text-sm text-gray-500">
          <RefreshCw className="w-4 h-4" />
          <span>Last updated: {config.updatedAt.toLocaleDateString()}</span>
        </div>
      </div>

      {/* Waitlist Settings */}
      <Card className="p-6">
        <div className="flex items-center mb-6">
          <Users className="w-6 h-6 text-blue-600 mr-3" />
          <h2 className="text-xl font-semibold">Waitlist Settings</h2>
        </div>

        <div className="space-y-6">
          {/* Waitlist Enabled Toggle */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex-1">
              <h3 className="font-medium text-gray-900">Enable Waitlist</h3>
              <p className="text-sm text-gray-600 mt-1">
                Allow users to join the waitlist and access waitlist features
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <span className={`text-sm font-medium ${
                config.waitlistEnabled ? 'text-green-600' : 'text-red-600'
              }`}>
                {config.waitlistEnabled ? 'Enabled' : 'Disabled'}
              </span>
              <Switch
                checked={config.waitlistEnabled}
                onCheckedChange={handleToggleWaitlist}
                disabled={loading}
              />
            </div>
          </div>

          {/* Auto-Add to Waitlist Toggle */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex-1">
              <h3 className="font-medium text-gray-900">Auto-Add New Users</h3>
              <p className="text-sm text-gray-600 mt-1">
                Automatically add new users to the waitlist when they register
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <span className={`text-sm font-medium ${
                config.autoAddToWaitlist ? 'text-green-600' : 'text-red-600'
              }`}>
                {config.autoAddToWaitlist ? 'Enabled' : 'Disabled'}
              </span>
              <Switch
                checked={config.autoAddToWaitlist}
                onCheckedChange={handleToggleAutoAdd}
                disabled={loading || !config.waitlistEnabled}
              />
            </div>
          </div>

          {/* Waitlist Capacity */}
          <div className="p-4 border rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-medium text-gray-900">Waitlist Capacity</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Maximum number of users allowed on the waitlist
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <Input
                type="number"
                min="1"
                value={localConfig.waitlistCapacity}
                onChange={(e) => setLocalConfig(prev => ({
                  ...prev,
                  waitlistCapacity: parseInt(e.target.value) || 1000
                }))}
                className="w-32"
                disabled={loading}
              />
              <span className="text-sm text-gray-500">users</span>
            </div>
          </div>

          {/* Invite Batch Size */}
          <div className="p-4 border rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-medium text-gray-900">Invite Batch Size</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Number of invites to send at once from the admin dashboard
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <Input
                type="number"
                min="1"
                max="100"
                value={localConfig.inviteBatchSize}
                onChange={(e) => setLocalConfig(prev => ({
                  ...prev,
                  inviteBatchSize: parseInt(e.target.value) || 10
                }))}
                className="w-32"
                disabled={loading}
              />
              <span className="text-sm text-gray-500">invites</span>
            </div>
          </div>
        </div>
      </Card>

      {/* System Information */}
      <Card className="p-6">
        <div className="flex items-center mb-6">
          <Shield className="w-6 h-6 text-gray-600 mr-3" />
          <h2 className="text-xl font-semibold">System Information</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-medium text-gray-900 mb-2">Configuration ID</h3>
            <p className="text-sm text-gray-600 font-mono">{config.id}</p>
          </div>
          <div>
            <h3 className="font-medium text-gray-900 mb-2">Created</h3>
            <p className="text-sm text-gray-600">{config.createdAt.toLocaleString()}</p>
          </div>
          <div>
            <h3 className="font-medium text-gray-900 mb-2">Last Updated</h3>
            <p className="text-sm text-gray-600">{config.updatedAt.toLocaleString()}</p>
          </div>
          <div>
            <h3 className="font-medium text-gray-900 mb-2">Updated By</h3>
            <p className="text-sm text-gray-600">{config.updatedBy}</p>
          </div>
        </div>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={isUpdating || loading}
          className="min-w-32"
        >
          {isUpdating ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              Save Changes
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
