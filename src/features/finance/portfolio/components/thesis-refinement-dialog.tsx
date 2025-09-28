// Thesis refinement dialog component
"use client";

import { useState } from "react";
import { Button } from "@/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/lib/components/ui/dialog";
import { Input } from "@/lib/components/ui/input";
import { Label } from "@/lib/components/ui/label";
import { Textarea } from "@/lib/components/ui/textarea";
import { usePortfolioManager } from "@/features/agents/hooks/use-portfolio-manager";

interface ThesisRefinementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefinementComplete: (refinement: {
    title: string;
    description: string;
    rationale: string;
  }) => void;
}

export function ThesisRefinementDialog({
  open,
  onOpenChange,
  onRefinementComplete,
}: ThesisRefinementDialogProps) {
  const [originalThesis, setOriginalThesis] = useState("");
  const [refinedTitle, setRefinedTitle] = useState("");
  const [refinedDescription, setRefinedDescription] = useState("");
  const [rationale, setRationale] = useState("");
  const [isRefining, setIsRefining] = useState(false);

  const {
    refineInvestmentThesis,
    isRefiningThesis,
    refineThesisError,
  } = usePortfolioManager();

  const handleRefine = async () => {
    if (!originalThesis.trim()) return;

    try {
      setIsRefining(true);
      const result = await refineInvestmentThesis({ thesis: originalThesis });
      
      setRefinedTitle(result.thesis_title);
      setRefinedDescription(result.thesis_description);
      setRationale(result.rationale);
    } catch (error) {
      console.error("Failed to refine thesis:", error);
    } finally {
      setIsRefining(false);
    }
  };

  const handleApply = () => {
    if (refinedTitle && refinedDescription) {
      onRefinementComplete({
        title: refinedTitle,
        description: refinedDescription,
        rationale,
      });
      onOpenChange(false);
    }
  };

  const handleClose = () => {
    setOriginalThesis("");
    setRefinedTitle("");
    setRefinedDescription("");
    setRationale("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Thesis Refinement</DialogTitle>
          <DialogDescription>
            Let the Portfolio Manager refine your investment thesis for clarity and impact.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Original Thesis Input */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Original Thesis</CardTitle>
              <CardDescription>
                Enter your investment thesis for refinement
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="original-thesis">Investment Thesis</Label>
                <Textarea
                  id="original-thesis"
                  value={originalThesis}
                  onChange={(e) => setOriginalThesis(e.target.value)}
                  placeholder="Enter your investment thesis..."
                  className="mt-1"
                  rows={4}
                />
              </div>
              <Button 
                onClick={handleRefine}
                disabled={isRefining || !originalThesis.trim()}
                className="w-full"
              >
                {isRefining ? "Refining..." : "Refine Thesis"}
              </Button>
              {refineThesisError && (
                <div className="text-red-600 text-sm">
                  Error: {refineThesisError}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Refined Results */}
          {(refinedTitle || refinedDescription) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Refined Thesis</CardTitle>
                <CardDescription>
                  The Portfolio Manager's refined version of your thesis
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="refined-title">Thesis Title</Label>
                  <Input
                    id="refined-title"
                    value={refinedTitle}
                    onChange={(e) => setRefinedTitle(e.target.value)}
                    placeholder="Refined thesis title..."
                    className="mt-1"
                  />
                </div>
                
                <div>
                  <Label htmlFor="refined-description">Thesis Description</Label>
                  <Textarea
                    id="refined-description"
                    value={refinedDescription}
                    onChange={(e) => setRefinedDescription(e.target.value)}
                    placeholder="Refined thesis description..."
                    className="mt-1"
                    rows={4}
                  />
                </div>

                {rationale && (
                  <div>
                    <Label htmlFor="rationale">Rationale</Label>
                    <Textarea
                      id="rationale"
                      value={rationale}
                      readOnly
                      className="mt-1 bg-muted"
                      rows={3}
                    />
                  </div>
                )}

                <div className="flex gap-2">
                  <Button onClick={handleApply} className="flex-1">
                    Apply Refinement
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={handleClose}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
