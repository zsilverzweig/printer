"use client";

import React, { useState } from "react";

import { Agent } from "@/features/ai/agents/types";
import { Button } from "@/lib/components/ui/button";
import {
  Card,
  CardContent,
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
import { Textarea } from "@/lib/components/ui/textarea";

import { CreatePortfolioRequest } from "../types";

interface CreatePortfolioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableAgents: Agent[];
  onCreatePortfolio: (request: CreatePortfolioRequest) => Promise<void>;
}

export function CreatePortfolioDialog({
  open,
  onOpenChange,
  availableAgents,
  onCreatePortfolio,
}: CreatePortfolioDialogProps) {
  const [formData, setFormData] = useState<CreatePortfolioRequest>({
    name: "",
    description: "",
    thesis: "",
    assignedAgentIds: [],
  });
  const [loading, setLoading] = useState(false);

  const handleAgentToggle = (agentId: string) => {
    setFormData((prev) => ({
      ...prev,
      assignedAgentIds: prev.assignedAgentIds?.includes(agentId)
        ? prev.assignedAgentIds.filter((id) => id !== agentId)
        : [...(prev.assignedAgentIds || []), agentId],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await onCreatePortfolio(formData);
      // Reset form
      setFormData({
        name: "",
        description: "",
        thesis: "",
        assignedAgentIds: [],
      });
    } catch (error) {
      console.error("Failed to create portfolio:", error);
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
        form="create-portfolio-form"
        disabled={loading}
        className="min-w-[140px]"
      >
        {loading ? "Creating..." : "Create Portfolio"}
      </Button>
    </>
  );

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Create New Portfolio"
      size="xl"
      footer={footer}
    >
      <ModalForm id="create-portfolio-form" onSubmit={handleSubmit}>
        {/* Basic Information */}
        <ModalSection title="Basic Information">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ModalField label="Portfolio Name" required>
              <Input
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="e.g., Tech Growth Portfolio"
                required
                className="w-full"
              />
            </ModalField>
            <ModalField label="Description" required>
              <Input
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Brief description of this portfolio"
                required
                className="w-full"
              />
            </ModalField>
          </div>
        </ModalSection>

        {/* Investment Thesis */}
        <ModalField label="Investment Thesis" required>
          <Textarea
            value={formData.thesis}
            onChange={(e) =>
              setFormData({ ...formData, thesis: e.target.value })
            }
            placeholder="Write your investment thesis here. This will be analyzed by the assigned AI agents..."
            rows={6}
            required
            className="resize-vertical"
          />
          <p className="text-sm text-muted-foreground mt-2">
            This thesis will be analyzed by your assigned AI agents to provide
            insights and recommendations.
          </p>
        </ModalField>

        {/* Agent Assignment */}
        <div>
          <label className="block text-sm font-medium mb-3">
            Assign AI Agents (Optional)
          </label>
          <p className="text-sm text-gray-600 mb-4">
            Select which AI agents should analyze this portfolio. You can assign
            agents later.
          </p>

          {availableAgents.length === 0 ? (
            <Card className="border-yellow-200 bg-yellow-50">
              <CardContent className="p-4">
                <p className="text-yellow-800 text-sm">
                  No active agents available. Contact your administrator to
                  create agents.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {availableAgents.map((agent) => (
                <Card
                  key={agent.id}
                  className={`cursor-pointer transition-colors ${
                    formData.assignedAgentIds?.includes(agent.id)
                      ? "ring-2 ring-blue-500 bg-blue-50"
                      : "hover:bg-gray-50"
                  }`}
                  onClick={() => handleAgentToggle(agent.id)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">{agent.name}</CardTitle>
                      <input
                        type="checkbox"
                        checked={
                          formData.assignedAgentIds?.includes(agent.id) || false
                        }
                        onChange={() => handleAgentToggle(agent.id)}
                        className="rounded border-gray-300"
                      />
                    </div>
                    <CardDescription className="text-xs">
                      {agent.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="text-xs text-gray-600">
                      <div className="flex justify-between">
                        <span>Model:</span>
                        <span>{agent.model.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Role:</span>
                        <span>{agent.role.replace("_", " ")}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </ModalForm>
    </Modal>
  );
}
