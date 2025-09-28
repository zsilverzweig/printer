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
  const [refinementGuidance, setRefinementGuidance] = useState("");
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
        userId: userId, // Pass the user ID for saving to Firestore
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
      setRefinementGuidance("");
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
      // Combine all four fields into comprehensive input for AI refinement
      const inputParts = [
        portfolioName.trim(),
        description.trim(), 
        thesis.trim(),
        refinementGuidance.trim()
      ].filter(part => part.length > 0);
      
      const inputThesis = inputParts.join(' ');
      
      const result = await refineThesis(inputThesis);
      
      // Update form fields with refined content
      if (result.thesis_title) {
        setPortfolioName(result.thesis_title);
      }
      if (result.thesis_description) {
        setDescription(result.thesis_description);
      }
      if (result.thesis) {
        setThesis(result.thesis);
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
            <ModalSection title="Portfolio Details">
              <ModalField label="Thesis Title">
                <Input
                  id="portfolio-name"
                  value={portfolioName}
                  onChange={(e) => setPortfolioName(e.target.value)}
                  placeholder="Enter compelling thesis title"
                />
              </ModalField>
              
              <ModalField label="Thesis Description">
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Clear, specific, and actionable thesis description..."
                  rows={3}
                />
              </ModalField>
              
              <ModalField label="Investment Thesis">
                <Textarea
                  id="thesis"
                  value={thesis}
                  onChange={(e) => setThesis(e.target.value)}
                  placeholder="Describe your investment thesis..."
                  rows={4}
                  required
                />
              </ModalField>

              <ModalField label="Refinement Guidance (Optional)">
                <Textarea
                  id="refinement-guidance"
                  value={refinementGuidance}
                  onChange={(e) => setRefinementGuidance(e.target.value)}
                  placeholder="Generally describe the refinements you want and our Portfolio Manager will do the rest..."
                  rows={2}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Tell the AI what specific changes or improvements you'd like to see
                </p>
              </ModalField>
            </ModalSection>
          </ModalForm>
        );
    }
  };

  const getFooterActions = () => {
    if (creationState === "idle" && hasContent) {
      return (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleRefineThesis}
          disabled={refiningThesis}
          className="bg-gradient-to-r from-purple-500 via-pink-500 to-red-500 text-white border-0 hover:from-purple-600 hover:via-pink-600 hover:to-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {refiningThesis ? "Refining..." : "✨ Refine Thesis"}
        </Button>
      );
    }
    return null;
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
      footerActions={getFooterActions()}
      footer={getFooter()}
    >
      {getStateContent()}
    </Modal>
  );
}
