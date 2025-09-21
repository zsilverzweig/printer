"use client";

import { Info } from "lucide-react";
import React, { useState } from "react";

import { Button } from "@/lib/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import { Input } from "@/lib/components/ui/input";
import {
  Modal,
  ModalField,
  ModalForm,
  ModalSection,
} from "@/lib/components/ui/modal";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/lib/components/ui/tooltip";

import { AgentTemplate, CreateAgentRequest } from "../types";

interface CreateAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: AgentTemplate[];
  onCreateAgent: (request: CreateAgentRequest) => Promise<void>;
}

export function CreateAgentDialog({
  open,
  onOpenChange,
  templates,
  onCreateAgent,
}: CreateAgentDialogProps) {
  const [formData, setFormData] = useState<CreateAgentRequest>({
    name: "",
    description: "",
    role: "custom",
    promptGuidance: "",
    templateId: undefined,
    model: "gpt-4o-mini",
    temperature: 0.3,
    maxTokens: 2000,
  });
  const [selectedTemplate, setSelectedTemplate] =
    useState<AgentTemplate | null>(null);
  const [loading, setLoading] = useState(false);

  const handleTemplateSelect = (template: AgentTemplate) => {
    setSelectedTemplate(template);
    setFormData({
      ...formData,
      name: template.name,
      description: template.description,
      role: template.role,
      promptGuidance: template.defaultPromptGuidance,
      templateId: template.id,
      model: template.defaultModel,
      temperature: template.defaultTemperature,
      maxTokens: template.defaultMaxTokens,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await onCreateAgent(formData);
      // Reset form
      setFormData({
        name: "",
        description: "",
        role: "custom",
        promptGuidance: "",
        templateId: undefined,
        model: "gpt-4o-mini",
        temperature: 0.3,
        maxTokens: 2000,
      });
      setSelectedTemplate(null);
    } catch (error) {
      // Error handling is done by the parent component
    } finally {
      setLoading(false);
    }
  };

  const footer = (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => onOpenChange(false)}
        disabled={loading}
      >
        Cancel
      </Button>
      <Button
        type="submit"
        form="create-agent-form"
        disabled={loading}
        className="min-w-[120px]"
      >
        {loading ? "Creating..." : "Create Agent"}
      </Button>
    </>
  );

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Create New Agent"
      size="2xl"
      footer={footer}
    >
      <ModalForm id="create-agent-form" onSubmit={handleSubmit}>
        {/* Template Selection */}
        <ModalSection title="Choose a Template (Optional)">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {templates.map((template) => (
              <Card
                key={template.id}
                className={`cursor-pointer transition-all duration-200 border-2 ${
                  selectedTemplate?.id === template.id
                    ? "border-primary bg-primary/10 ring-2 ring-primary/20"
                    : "border-border hover:border-primary/50 hover:bg-muted/50"
                }`}
                onClick={() => handleTemplateSelect(template)}
              >
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-medium text-foreground">
                    {template.name}
                  </CardTitle>
                  <CardDescription className="text-sm text-muted-foreground">
                    {template.description}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </ModalSection>

        {/* Basic Information */}
        <ModalSection title="Basic Information">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ModalField label="Name" required>
              <Input
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="Enter agent name"
                required
                className="w-full"
              />
            </ModalField>
            <ModalField label="Role" required>
              <select
                value={formData.role}
                onChange={(e) =>
                  setFormData({ ...formData, role: e.target.value as any })
                }
                className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                required
              >
                <option value="business_fundamentals">
                  Business Fundamentals
                </option>
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
            </ModalField>
          </div>
        </ModalSection>

        {/* Description */}
        <ModalField label="Description" required>
          <Input
            value={formData.description}
            onChange={(e) =>
              setFormData({ ...formData, description: e.target.value })
            }
            placeholder="Brief description of the agent's purpose"
            required
            className="w-full"
          />
        </ModalField>

        {/* Prompt Guidance */}
        <ModalField label="Prompt Guidance" required>
          <textarea
            value={formData.promptGuidance}
            onChange={(e) =>
              setFormData({ ...formData, promptGuidance: e.target.value })
            }
            placeholder="Define the agent's specific instructions and guidance..."
            className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-vertical"
            rows={6}
            required
          />
        </ModalField>

        {/* Model Configuration */}
        <ModalSection title="Model Configuration">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <ModalField label="Model">
              <select
                value={formData.model}
                onChange={(e) =>
                  setFormData({ ...formData, model: e.target.value })
                }
                className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="gpt-4o">GPT-4o</option>
                <option value="gpt-4o-mini">GPT-4o Mini</option>
                <option value="gpt-4-turbo">GPT-4 Turbo</option>
                <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
              </select>
            </ModalField>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="block text-sm font-medium text-foreground">
                  Temperature
                </label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-4 w-4 p-0">
                        <Info className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-sm">
                        Controls randomness in responses. Lower values (0.1-0.3)
                        are more focused and deterministic, while higher values
                        (0.7-1.0) are more creative and varied.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Input
                type="number"
                min="0"
                max="2"
                step="0.1"
                value={formData.temperature}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    temperature: parseFloat(e.target.value),
                  })
                }
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="block text-sm font-medium text-foreground">
                  Max Tokens
                </label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-4 w-4 p-0">
                        <Info className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-sm">
                        Maximum number of tokens in the response. Roughly 1
                        token = 0.75 words. Higher values allow longer responses
                        but cost more.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Input
                type="number"
                min="100"
                max="8000"
                value={formData.maxTokens}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    maxTokens: parseInt(e.target.value),
                  })
                }
                className="w-full"
              />
            </div>
          </div>
        </ModalSection>
      </ModalForm>
    </Modal>
  );
}
