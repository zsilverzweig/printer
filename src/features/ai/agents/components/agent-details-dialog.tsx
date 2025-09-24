"use client";

import React, { useState } from "react";

import { Badge } from "@/lib/components/ui/badge";
import { Button } from "@/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import { Input } from "@/lib/components/ui/input";
import { Modal } from "@/lib/components/ui/modal";
import { Textarea } from "@/lib/components/ui/textarea";

import { useAgents } from "../hooks/use-agents";
import { Agent, UpdateAgentRequest } from "../types";

interface AgentDetailsDialogProps {
  agent: Agent | null;
  onClose: () => void;
  onUpdateAgent: (
    agentId: string,
    updates: UpdateAgentRequest
  ) => Promise<void>;
  onDeleteAgent: (agentId: string) => void;
}

export function AgentDetailsDialog({
  agent,
  onClose,
  onUpdateAgent,
  onDeleteAgent,
}: AgentDetailsDialogProps) {
  const { getAgentVersions } = useAgents();
  const [versions, setVersions] = useState<any[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState<UpdateAgentRequest>({});

  React.useEffect(() => {
    if (agent) {
      setFormData({
        name: agent.name,
        description: agent.description,
        promptGuidance: agent.promptGuidance,
        temperature: agent.temperature,
        maxTokens: agent.maxTokens,
      });
      loadVersions();
    }
  }, [agent]);

  const loadVersions = async () => {
    if (!agent) return;

    setLoadingVersions(true);
    try {
      const agentVersions = await getAgentVersions(agent.id);
      setVersions(agentVersions);
    } catch (error) {
      console.error("Failed to load versions:", error);
    } finally {
      setLoadingVersions(false);
    }
  };

  const handleSave = async () => {
    if (!agent) return;

    try {
      await onUpdateAgent(agent.id, formData);
      setEditing(false);
    } catch (error) {
      console.error("Failed to update agent:", error);
    }
  };

  const handleDelete = () => {
    if (!agent) return;

    if (
      confirm(
        "Are you sure you want to delete this agent? This action cannot be undone."
      )
    ) {
      onDeleteAgent(agent.id);
      onClose();
    }
  };

  if (!agent) return null;

  return (
    <Modal
      open={Boolean(agent)}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      title="Agent Details"
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button variant="destructive" onClick={handleDelete}>
            Delete Agent
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Basic Information</CardTitle>
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditing(!editing)}
                >
                  {editing ? "Cancel" : "Edit"}
                </Button>
                {editing && (
                  <Button size="sm" onClick={handleSave}>
                    Save
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Name</label>
                {editing ? (
                  <Input
                    value={formData.name || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                  />
                ) : (
                  <p className="text-foreground">{agent.name}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Role</label>
                <Badge variant="outline">
                  {agent.role.replace("_", " ").toUpperCase()}
                </Badge>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Description
              </label>
              {editing ? (
                <Input
                  value={formData.description || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                />
              ) : (
                <p className="text-foreground">{agent.description}</p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Model</label>
                <p className="text-foreground">{agent.model.name}</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Temperature
                </label>
                {editing ? (
                  <Input
                    type="number"
                    min="0"
                    max="2"
                    step="0.1"
                    value={formData.temperature || agent.temperature}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        temperature: parseFloat(e.target.value),
                      })
                    }
                  />
                ) : (
                  <p className="text-foreground">{agent.temperature}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Max Tokens
                </label>
                {editing ? (
                  <Input
                    type="number"
                    min="100"
                    max="8000"
                    value={formData.maxTokens || agent.maxTokens}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        maxTokens: parseInt(e.target.value),
                      })
                    }
                  />
                ) : (
                  <p className="text-foreground">{agent.maxTokens}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Version
                </label>
                <p className="text-foreground">{agent.version}</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Status</label>
                <Badge variant={agent.isActive ? "default" : "secondary"}>
                  {agent.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Prompt Guidance */}
        <Card>
          <CardHeader>
            <CardTitle>Prompt Guidance</CardTitle>
          </CardHeader>
          <CardContent>
            {editing ? (
              <Textarea
                value={formData.promptGuidance || ""}
                onChange={(e) =>
                  setFormData({ ...formData, promptGuidance: e.target.value })
                }
                rows={8}
                className="min-h-[200px] resize-vertical"
              />
            ) : (
              <div className="bg-muted p-4 rounded-md">
                <pre className="whitespace-pre-wrap text-sm text-foreground">
                  {agent.promptGuidance}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Version History */}
        <Card>
          <CardHeader>
            <CardTitle>Version History</CardTitle>
            <CardDescription>
              Track changes to agent configuration over time
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingVersions ? (
              <div className="text-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto mb-2"></div>
                <p className="text-sm text-muted-foreground">
                  Loading versions...
                </p>
              </div>
            ) : versions.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                No version history available
              </p>
            ) : (
              <div className="space-y-3">
                {versions.map((version, index) => (
                  <div
                    key={version.id}
                    className={`p-3 rounded-md border ${
                      index === 0
                        ? "bg-primary/10 border-primary/20"
                        : "bg-muted border-border"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Version {version.version}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(version.createdAt).toLocaleDateString()}
                        </p>
                        {version.changeReason && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {version.changeReason}
                          </p>
                        )}
                      </div>
                      <Badge variant={index === 0 ? "default" : "secondary"}>
                        {index === 0 ? "Current" : "Previous"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Modal>
  );
}
