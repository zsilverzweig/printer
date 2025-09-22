'use client'

import React from 'react'

import { Badge } from '@/lib/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/lib/components/ui/card'

import { AgentWork, WorkStatus } from '../types'

interface AgentWorkCardProps {
  work: AgentWork
}

export function AgentWorkCard({ work }: AgentWorkCardProps) {
  const getStatusColor = (status: WorkStatus) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800'
      case 'running':
        return 'bg-blue-100 text-blue-800'
      case 'pending':
        return 'bg-yellow-100 text-yellow-800'
      case 'failed':
        return 'bg-red-100 text-red-800'
      case 'cancelled':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusIcon = (status: WorkStatus) => {
    switch (status) {
      case 'completed':
        return '✅'
      case 'running':
        return '🔄'
      case 'pending':
        return '⏳'
      case 'failed':
        return '❌'
      case 'cancelled':
        return '⏹️'
      default:
        return '❓'
    }
  }

  const formatResponse = (content: string) => {
    try {
      const parsed = JSON.parse(content)
      return JSON.stringify(parsed, null, 2)
    } catch {
      return content
    }
  }

  return (
    <Card className="border-l-4 border-l-blue-500">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">{work.agent.name}</CardTitle>
            <CardDescription>
              {work.agent.description}
            </CardDescription>
          </div>
          <div className="flex items-center space-x-2">
            <Badge className={getStatusColor(work.status)}>
              {getStatusIcon(work.status)} {work.status.toUpperCase()}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Work Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium text-gray-600">Started:</span>
            <span className="ml-2">
              {new Date(work.startedAt).toLocaleString()}
            </span>
          </div>
          {work.completedAt && (
            <div>
              <span className="font-medium text-gray-600">Completed:</span>
              <span className="ml-2">
                {new Date(work.completedAt).toLocaleString()}
              </span>
            </div>
          )}
          {work.response && (
            <>
              <div>
                <span className="font-medium text-gray-600">Model:</span>
                <span className="ml-2">{work.response.model}</span>
              </div>
              <div>
                <span className="font-medium text-gray-600">Tokens Used:</span>
                <span className="ml-2">{work.response.tokensUsed.totalTokens}</span>
              </div>
              <div>
                <span className="font-medium text-gray-600">Cost:</span>
                <span className="ml-2">${work.response.cost.toFixed(4)}</span>
              </div>
              <div>
                <span className="font-medium text-gray-600">Processing Time:</span>
                <span className="ml-2">{work.response.processingTime}ms</span>
              </div>
            </>
          )}
        </div>

        {/* Error Message */}
        {work.error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3">
            <h4 className="font-medium text-red-800 mb-1">Error</h4>
            <p className="text-red-700 text-sm">{work.error}</p>
          </div>
        )}

        {/* AI Response */}
        {work.response && work.status === 'completed' && (
          <div className="space-y-3">
            <h4 className="font-medium text-gray-900">AI Analysis</h4>
            <div className="bg-gray-50 border rounded-md p-4">
              <pre className="whitespace-pre-wrap text-sm text-gray-900 overflow-x-auto">
                {formatResponse(work.response.content)}
              </pre>
            </div>
          </div>
        )}

        {/* Thesis Context */}
        <div className="space-y-2">
          <h4 className="font-medium text-gray-900">Investment Thesis</h4>
          <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
            <p className="text-sm text-blue-900 line-clamp-4">
              {work.thesis}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
