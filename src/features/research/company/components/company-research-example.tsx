"use client";

import React, { useState } from "react";

import { Button } from "@/lib/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/lib/components/ui/card";
import { Input } from "@/lib/components/ui/input";
import { Label } from "@/lib/components/ui/label";
import { Textarea } from "@/lib/components/ui/textarea";
import { useToast } from "@/lib/hooks/use-toast";
import { Loader2 } from "lucide-react";

import { useCompanyResearch } from "@/features/agents/hooks/use-company-research";
import { CompanyResearchInput } from "@/features/agents/agents/company-research/types/work-types";

export function CompanyResearchExample() {
  const { conductCompanyResearch, isResearching, researchError } = useCompanyResearch();
  const { toast } = useToast();

  const [companyTicker, setCompanyTicker] = useState("");
  const [researchResult, setResearchResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleResearch = async () => {
    if (!companyTicker.trim()) return;

    setError(null);
    try {
      const input: CompanyResearchInput = {
        companyTicker: companyTicker.toUpperCase(),
      };

      const result = await conductCompanyResearch(input);
      setResearchResult(result);
      
      toast({
        title: "Research Complete",
        description: `Research completed for ${companyTicker}`,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to conduct research";
      setError(errorMessage);
      toast({
        title: "Research Failed",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-3xl font-bold">Company Research Agent Example</h1>
      <p className="text-muted-foreground">
        Demonstrates the new Company Research agent with typed work capabilities.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Research Request</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="ticker">Company Ticker</Label>
            <Input
              id="ticker"
              value={companyTicker}
              onChange={(e) => setCompanyTicker(e.target.value)}
              placeholder="e.g., AAPL, MSFT, GOOGL"
              className="mt-1"
            />
          </div>
          

          <Button onClick={handleResearch} disabled={isResearching || !companyTicker.trim()}>
            {isResearching && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Conduct Research
          </Button>

          {(error || researchError) && (
            <div className="text-red-600 text-sm">
              Error: {error || researchError}
            </div>
          )}
        </CardContent>
      </Card>

      {researchResult && (
        <Card>
          <CardHeader>
            <CardTitle>Research Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">Executive Summary</h3>
              <p className="text-sm text-muted-foreground">{researchResult.executive_summary}</p>
            </div>
            

            <div>
              <h3 className="font-semibold mb-2">Full Report</h3>
              <div className="max-h-64 overflow-y-auto p-3 bg-muted rounded text-sm">
                {researchResult.research_report}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
