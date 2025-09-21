'use client'

import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/lib/components/ui/card'
import { Button } from '@/lib/components/ui/button'
import { Badge } from '@/lib/components/ui/badge'
import { Agent } from '../types'

interface AgentListProps {
  agents: Agent[]
  onSelectAgent: (agent: Agent) => void
  onDeleteAgent: (agentId: string) => void
}

export function AgentList({ agents, onSelectAgent, onDeleteAgent }: AgentListProps) {
  if (agents.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="text-gray-500">
            <h3 className="text-lg font-medium mb-2">No agents found</h3>
            <p>Create your first agent to get started with AI-powered investment analysis.</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {agents.map((agent) => (
        <Card key={agent.id} className="hover:shadow-md transition-shadow cursor-pointer">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <CardTitle className="text-lg">{agent.name}</CardTitle>
                <CardDescription className="mt-1">
                  {agent.description}
                </CardDescription>
              </div>
              <div className="flex items-center space-x-2">
                <Badge variant={agent.isActive ? 'default' : 'secondary'}>
                  {agent.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-3">
              <div>
                <Badge variant="outline" className="text-xs">
                  {agent.role.replace('_', ' ').toUpperCase()}
                </Badge>
              </div>
              
              <div className="text-sm text-gray-600">
                <div className="flex justify-between">
                  <span>Model:</span>
                  <span className="font-medium">{agent.model.name}</span>
                </div>
                <div className="flex justify-between">
                  <span>Version:</span>
                  <span className="font-medium">{agent.version}</span>
                </div>
                <div className="flex justify-between">
                  <span>Temperature:</span>
                  <span className="font-medium">{agent.temperature}</span>
                </div>
              </div>

              <div className="flex space-x-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onSelectAgent(agent)}
                  className="flex-1"
                >
                  View Details
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onDeleteAgent(agent.id)}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  Delete
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
