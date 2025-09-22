'use client'

import React from 'react'

import { Badge } from '@/lib/components/ui/badge'
import { Button } from '@/lib/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/lib/components/ui/card'

import { Portfolio } from '../types'

interface PortfolioListProps {
  portfolios: Portfolio[]
  onSelectPortfolio: (portfolio: Portfolio) => void
  onDeletePortfolio: (portfolioId: string) => void
}

export function PortfolioList({ portfolios, onSelectPortfolio, onDeletePortfolio }: PortfolioListProps) {
  if (portfolios.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="text-gray-500">
            <h3 className="text-lg font-medium mb-2">No portfolios found</h3>
            <p>Create your first portfolio to start working with AI agents on your investment theses.</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {portfolios.map((portfolio) => (
        <Card key={portfolio.id} className="hover:shadow-md transition-shadow cursor-pointer">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <CardTitle className="text-lg">{portfolio.name}</CardTitle>
                <CardDescription className="mt-1">
                  {portfolio.description}
                </CardDescription>
              </div>
              <div className="flex items-center space-x-2">
                <Badge variant={portfolio.isActive ? 'default' : 'secondary'}>
                  {portfolio.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-3">
              {/* Thesis Preview */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Thesis</label>
                <p className="text-sm text-gray-900 line-clamp-3">
                  {portfolio.thesis}
                </p>
              </div>

              {/* Assigned Agents */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Assigned Agents</label>
                <div className="flex flex-wrap gap-1">
                  {portfolio.assignedAgents.length === 0 ? (
                    <span className="text-sm text-gray-500">No agents assigned</span>
                  ) : (
                    portfolio.assignedAgents.map((assignedAgent) => (
                      <Badge key={assignedAgent.agentId} variant="outline" className="text-xs">
                        {assignedAgent.agent.name}
                      </Badge>
                    ))
                  )}
                </div>
              </div>

              {/* Stats */}
              <div className="text-sm text-gray-600">
                <div className="flex justify-between">
                  <span>Created:</span>
                  <span className="font-medium">
                    {new Date(portfolio.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Last Updated:</span>
                  <span className="font-medium">
                    {new Date(portfolio.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex space-x-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onSelectPortfolio(portfolio)}
                  className="flex-1"
                >
                  View Details
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onDeletePortfolio(portfolio.id)}
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
