"use client";

import { useState } from "react";

import { Button } from "@/lib/components/ui/button";
import { Input } from "@/lib/components/ui/input";
import { Label } from "@/lib/components/ui/label";
import {
  Modal,
  ModalField,
  ModalForm,
  ModalSection,
} from "@/lib/components/ui/modal";
import { Progress } from "@/lib/components/ui/progress";
import { Switch } from "@/lib/components/ui/switch";
import { Textarea } from "@/lib/components/ui/textarea";

import { usePortfolio } from "../hooks/use-portfolio";
import { useThesis } from "../hooks/use-thesis";

interface PortfolioCreatorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: (portfolio: any) => void;
  userId: string;
}

type CreationState = "idle" | "creating" | "success" | "error";

export function PortfolioCreatorDialog({
  open,
  onOpenChange,
  onComplete,
  userId,
}: PortfolioCreatorDialogProps) {
  const [portfolioName, setPortfolioName] = useState("");
  const [thesis, setThesis] = useState("");
  const [description, setDescription] = useState("");
  const [creationState, setCreationState] = useState<CreationState>("idle");

  const { createPortfolio, creating, error } = usePortfolio(userId);
  
  // Get thesis operations from dedicated hook
  const { refineThesis, refiningThesis } = useThesis();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!thesis.trim()) return;

    try {
      setCreationState("creating");
      
      const portfolio = await createPortfolio({
        name: portfolioName.trim() || `Portfolio - ${new Date().toLocaleDateString()}`,
        description: description.trim() || "Generated portfolio",
        thesis: thesis.trim(),
        positions: [], // Will be populated by agents later
        metadata: {
          wasRefined: false, // We'll track this based on whether the button was used
          originalThesis: thesis.trim()
        }
      });

      setCreationState("success");
      onComplete(portfolio);
      onOpenChange(false);
      
      // Reset form
      setPortfolioName("");
      setThesis("");
      setDescription("");
      setCreationState("idle");
      
    } catch (err) {
      setCreationState("error");
    }
  };

  const handleClose = () => {
    if (creationState === "creating") return; // Prevent closing during creation
    onOpenChange(false);
    setCreationState("idle");
  };

  const handleRefineThesis = async () => {
    try {
      const inputThesis = thesis.trim() || `${portfolioName.trim()} ${description.trim()}`.trim();
      
      const result = await refineThesis(inputThesis);
      
      // Update form fields with refined content
      if (result.thesis_title) {
        setPortfolioName(result.thesis_title);
      }
      if (result.thesis_description) {
        setDescription(result.thesis_description);
      }
      if (result.rationale) {
        setThesis(result.rationale);
      }
    } catch (err) {
      console.error("Failed to refine thesis:", err);
    }
  };

  // Check if any field has content to enable the refine button
  const hasContent = portfolioName.trim() || description.trim() || thesis.trim();

  const getStateContent = () => {
    switch (creationState) {
      case "creating":
        return (
          <div className="p-6 space-y-4">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <h3 className="text-lg font-semibold">Creating Portfolio</h3>
              <p className="text-sm text-gray-600">Please wait while we create your portfolio...</p>
            </div>
            <Progress value={66} className="w-full" />
          </div>
        );
      
      case "success":
        return (
          <div className="p-6 text-center">
            <div className="text-green-600 text-4xl mb-4">✅</div>
            <h3 className="text-lg font-semibold text-green-800">Portfolio Created!</h3>
            <p className="text-sm text-gray-600">Your portfolio has been successfully created.</p>
          </div>
        );
      
      case "error":
        return (
          <div className="p-6 text-center">
            <div className="text-red-600 text-4xl mb-4">❌</div>
            <h3 className="text-lg font-semibold text-red-800">Creation Failed</h3>
            <p className="text-sm text-gray-600 mb-4">{error || "Something went wrong"}</p>
            <Button onClick={() => setCreationState("idle")} variant="outline">
              Try Again
            </Button>
          </div>
        );
      
      default:
        return (
          <ModalForm onSubmit={handleSubmit} id="portfolio-creator-form">
            <ModalSection>
              <ModalField>
                <Label htmlFor="portfolio-name">Portfolio Name</Label>
                <Input
                  id="portfolio-name"
                  value={portfolioName}
                  onChange={(e) => setPortfolioName(e.target.value)}
                  placeholder="Enter portfolio name"
                />
              </ModalField>
              
              <ModalField>
                <Label htmlFor="description">Description (Optional)</Label>
                <Input
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of your portfolio"
                />
              </ModalField>
              
              <ModalField>
                <Label htmlFor="thesis">Investment Thesis</Label>
                <Textarea
                  id="thesis"
                  value={thesis}
                  onChange={(e) => setThesis(e.target.value)}
                  placeholder="Describe your investment thesis..."
                  rows={4}
                  required
                />
              </ModalField>
              
              <ModalField>
                <div className="flex items-center justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleRefineThesis}
                    disabled={!hasContent || refiningThesis}
                  >
                    {refiningThesis ? "Refining..." : "Refine Thesis"}
                  </Button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Let AI improve and structure your investment thesis
                </p>
              </ModalField>
            </ModalSection>
          </ModalForm>
        );
    }
  };

  const getFooter = () => {
    if (creationState === "creating") {
      return (
        <div className="flex justify-end">
          <Button disabled>Creating...</Button>
        </div>
      );
    }
    
    if (creationState === "success" || creationState === "error") {
      return (
        <div className="flex justify-end">
          <Button onClick={handleClose}>
            {creationState === "success" ? "Done" : "Close"}
          </Button>
        </div>
      );
    }
    
    return (
      <div className="flex justify-end space-x-2">
        <Button variant="outline" onClick={handleClose}>
          Cancel
        </Button>
        <Button 
          type="submit" 
          form="portfolio-creator-form"
          disabled={!thesis.trim() || creating}
        >
          Create Portfolio
        </Button>
      </div>
    );
  };

  return (
    <Modal
      open={open}
      onOpenChange={handleClose}
      title="Create Portfolio"
      description="Create a new investment portfolio with your thesis"
      footer={getFooter()}
    >
      {getStateContent()}
    </Modal>
  );
}
