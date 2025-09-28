// Example component demonstrating the new Portfolio Manager agent system
"use client";

import { useState } from "react";

import { Button } from "@/lib/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/lib/components/ui/card";
import { Textarea } from "@/lib/components/ui/textarea";

import { usePortfolioManager } from "../hooks/use-portfolio-manager";

export function PortfolioManagerExample() {
  const [thesis, setThesis] = useState("");
  const [refinedThesis, setRefinedThesis] = useState("");
  const [rationale, setRationale] = useState("");
  
  const {
    generatePortfolio,
    isGeneratingPortfolio,
    generatePortfolioError,
    refineInvestmentThesis,
    isRefiningThesis,
    refineThesisError,
    agentName,
    workTypes
  } = usePortfolioManager();

  const handleRefineThesis = async () => {
    if (!thesis.trim()) return;

    try {
      const result = await refineInvestmentThesis({ thesis });
      setRefinedThesis(result.refined_thesis);
      setRationale(result.rationale);
    } catch (error) {
      console.error("Failed to refine thesis:", error);
    }
  };

  const handleGeneratePortfolio = async () => {
    if (!thesis.trim()) return;

    try {
      const result = await generatePortfolio({ 
        thesis,
        riskTolerance: "moderate",
        timeHorizon: "2-3 years"
      });
      console.log("Generated portfolio:", result);
    } catch (error) {
      console.error("Failed to generate portfolio:", error);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{agentName} Agent</CardTitle>
          <p className="text-sm text-muted-foreground">
            Available work types: {workTypes.join(", ")}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Investment Thesis</label>
            <Textarea
              value={thesis}
              onChange={(e) => setThesis(e.target.value)}
              placeholder="Enter your investment thesis..."
              className="mt-1"
            />
          </div>

          <div className="flex gap-2">
            <Button 
              onClick={handleRefineThesis}
              disabled={isRefiningThesis || !thesis.trim()}
            >
              {isRefiningThesis ? "Refining..." : "Refine Thesis"}
            </Button>
            
            <Button 
              onClick={handleGeneratePortfolio}
              disabled={isGeneratingPortfolio || !thesis.trim()}
              variant="outline"
            >
              {isGeneratingPortfolio ? "Generating..." : "Generate Portfolio"}
            </Button>
          </div>

          {refineThesisError && (
            <div className="text-red-600 text-sm">
              Error: {refineThesisError}
            </div>
          )}

          {generatePortfolioError && (
            <div className="text-red-600 text-sm">
              Error: {generatePortfolioError}
            </div>
          )}
        </CardContent>
      </Card>

      {refinedThesis && (
        <Card>
          <CardHeader>
            <CardTitle>Refined Thesis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">Refined Version</label>
              <p className="mt-1 p-3 bg-muted rounded-md">{refinedThesis}</p>
            </div>
            
            {rationale && (
              <div>
                <label className="text-sm font-medium">Rationale</label>
                <p className="mt-1 p-3 bg-muted rounded-md">{rationale}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
