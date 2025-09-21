'use client'

import React, { useState } from 'react'
import { Button } from '@/lib/components/ui/button'
import { Input } from '@/lib/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/lib/components/ui/card'
import { AgentTemplate, CreateAgentRequest } from '../types'

interface CreateAgentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  templates: AgentTemplate[]
  onCreateAgent: (request: CreateAgentRequest) => Promise<void>
}

export function CreateAgentDialog({ 
  open, 
  onOpenChange, 
  templates, 
  onCreateAgent 
}: CreateAgentDialogProps) {
  const [formData, setFormData] = useState<CreateAgentRequest>({
    name: '',
    description: '',
    role: 'custom',
    promptGuidance: '',
    templateId: undefined,
    model: 'gpt-4o-mini',
    temperature: 0.3,
    maxTokens: 2000
  })
  const [selectedTemplate, setSelectedTemplate] = useState<AgentTemplate | null>(null)
  const [loading, setLoading] = useState(false)

  const handleTemplateSelect = (template: AgentTemplate) => {
    setSelectedTemplate(template)
    setFormData({
      ...formData,
      name: template.name,
      description: template.description,
      role: template.role,
      promptGuidance: template.defaultPromptGuidance,
      templateId: template.id,
      model: template.defaultModel,
      temperature: template.defaultTemperature,
      maxTokens: template.defaultMaxTokens
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    
    try {
      await onCreateAgent(formData)
      // Reset form
      setFormData({
        name: '',
        description: '',
        role: 'custom',
        promptGuidance: '',
        templateId: undefined,
        model: 'gpt-4o-mini',
        temperature: 0.3,
        maxTokens: 2000
      })
      setSelectedTemplate(null)
    } catch (error) {
      console.error('Failed to create agent:', error)
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">Create New Agent</h2>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Template Selection */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Choose a Template (Optional)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {templates.map((template) => (
                  <Card
                    key={template.id}
                    className={`cursor-pointer transition-colors ${
                      selectedTemplate?.id === template.id
                        ? 'ring-2 ring-blue-500 bg-blue-50'
                        : 'hover:bg-gray-50'
                    }`}
                    onClick={() => handleTemplateSelect(template)}
                  >
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">{template.name}</CardTitle>
                      <CardDescription className="text-xs">
                        {template.description}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            </div>

            {/* Basic Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Name</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Agent name"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Role</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="business_fundamentals">Business Fundamentals</option>
                  <option value="risk_assessor">Risk Assessor</option>
                  <option value="narrative_analyst">Narrative Analyst</option>
                  <option value="counterpoint_agent">Counterpoint Agent</option>
                  <option value="product_analyst">Product Analyst</option>
                  <option value="management_analyst">Management Analyst</option>
                  <option value="market_analyst">Market Analyst</option>
                  <option value="financial_analyst">Financial Analyst</option>
                  <option value="competitive_analyst">Competitive Analyst</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Description</label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of the agent's purpose"
                required
              />
            </div>

            {/* Prompt Guidance */}
            <div>
              <label className="block text-sm font-medium mb-2">Prompt Guidance</label>
              <textarea
                value={formData.promptGuidance}
                onChange={(e) => setFormData({ ...formData, promptGuidance: e.target.value })}
                placeholder="Define the agent's specific instructions and guidance..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={6}
                required
              />
            </div>

            {/* Model Configuration */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Model</label>
                <select
                  value={formData.model}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="gpt-4o">GPT-4o</option>
                  <option value="gpt-4o-mini">GPT-4o Mini</option>
                  <option value="gpt-4-turbo">GPT-4 Turbo</option>
                  <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Temperature</label>
                <Input
                  type="number"
                  min="0"
                  max="2"
                  step="0.1"
                  value={formData.temperature}
                  onChange={(e) => setFormData({ ...formData, temperature: parseFloat(e.target.value) })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Max Tokens</label>
                <Input
                  type="number"
                  min="100"
                  max="8000"
                  value={formData.maxTokens}
                  onChange={(e) => setFormData({ ...formData, maxTokens: parseInt(e.target.value) })}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end space-x-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading}
              >
                {loading ? 'Creating...' : 'Create Agent'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
