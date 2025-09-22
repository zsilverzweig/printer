"use client";

import React, { useState } from "react";

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

import { Agent, CreatePortfolioRequest } from "../types";

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
      size="2xl"
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
          <textarea
            value={formData.thesis}
            onChange={(e) =>
              setFormData({ ...formData, thesis: e.target.value })
            }
            placeholder="Write your investment thesis here. This will be analyzed by the assigned AI agents..."
            className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-vertical"
            rows={6}
            required
          />
          <p className="text-sm text-muted-foreground mt-2">
            This thesis will be analyzed by your assigned AI agents to provide
            insights and recommendations.
          </p>
        </ModalField>

        {/* Agent Assignment */}
        <ModalSection title="Assign AI Agents (Optional)">
          <p className="text-sm text-muted-foreground mb-4">
            Select which AI agents should analyze this portfolio. You can assign
            agents later.
          </p>

          {availableAgents.length === 0 ? (
            <Card className="border-yellow-500/50 bg-yellow-500/10">
              <CardContent className="p-4">
                <p className="text-yellow-600 dark:text-yellow-400 text-sm">
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
                  className={`cursor-pointer transition-all duration-200 ${
                    formData.assignedAgentIds?.includes(agent.id)
                      ? "ring-2 ring-primary bg-primary/10 border-primary/50"
                      : "hover:bg-muted/50 border-border"
                  }`}
                  onClick={() => handleAgentToggle(agent.id)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-sm font-medium">
                          {agent.name}
                        </CardTitle>
                        <CardDescription className="text-xs mt-1">
                          {agent.description}
                        </CardDescription>
                      </div>
                      <input
                        type="checkbox"
                        checked={
                          formData.assignedAgentIds?.includes(agent.id) || false
                        }
                        onChange={() => handleAgentToggle(agent.id)}
                        className="ml-3 rounded border-border bg-background text-primary focus:ring-2 focus:ring-primary focus:ring-offset-0"
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="text-xs text-muted-foreground space-y-1">
                      <div className="flex justify-between">
                        <span>Model:</span>
                        <span className="font-medium">{agent.model.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Role:</span>
                        <span className="font-medium capitalize">
                          {agent.role.replace("_", " ")}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ModalSection>
      </ModalForm>
    </Modal>
  );
}
