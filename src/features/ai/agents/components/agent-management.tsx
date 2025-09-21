'use client'

import React, { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/lib/components/ui/card'
import { Button } from '@/lib/components/ui/button'
import { Input } from '@/lib/components/ui/input'
import { useAgents } from '../hooks/use-agents'
import {
  Agent,
  AgentTemplate,
  CreateAgentRequest,
  UpdateAgentRequest,
} from '../types'
import { AgentList } from './agent-list'
import { CreateAgentDialog } from './create-agent-dialog'
import { AgentDetailsDialog } from './agent-details-dialog'

export function AgentManagement() {
  const { agents, templates, loading, error, createAgent, updateAgent, deleteAgent } = useAgents()
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  const filteredAgents = agents.filter(agent =>
    agent.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    agent.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    agent.role.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleCreateAgent = async (request: CreateAgentRequest) => {
    try {
      await createAgent(request)
      setShowCreateDialog(false)
    } catch (error) {
      console.error('Failed to create agent:', error)
    }
  }

  const handleUpdateAgent = async (agentId: string, updates: UpdateAgentRequest) => {
    try {
      await updateAgent(agentId, updates)
      setSelectedAgent(null)
    } catch (error) {
      console.error('Failed to update agent:', error)
    }
  }

  const handleDeleteAgent = async (agentId: string) => {
    if (confirm('Are you sure you want to delete this agent?')) {
      try {
        await deleteAgent(agentId)
      } catch (error) {
        console.error('Failed to delete agent:', error)
      }
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading agents...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-6">
            <div className="text-red-800">
              <h3 className="font-semibold mb-2">Error Loading Agents</h3>
              <p>{error}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Agent Management</h1>
          <p className="text-gray-600 mt-2">
            Create and manage AI agents for investment analysis
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          Create Agent
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Agents</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{agents.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Active Agents</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {agents.filter(agent => agent.isActive).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Templates</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{templates.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="flex items-center space-x-4">
        <div className="flex-1">
          <Input
            placeholder="Search agents by name, description, or role..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-sm"
          />
        </div>
      </div>

      {/* Agent List */}
      <AgentList
        agents={filteredAgents}
        onSelectAgent={setSelectedAgent}
        onDeleteAgent={handleDeleteAgent}
      />

      {/* Dialogs */}
      <CreateAgentDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        templates={templates}
        onCreateAgent={handleCreateAgent}
      />

      <AgentDetailsDialog
        agent={selectedAgent}
        onClose={() => setSelectedAgent(null)}
        onUpdateAgent={handleUpdateAgent}
        onDeleteAgent={handleDeleteAgent}
      />
    </div>
  )
}
