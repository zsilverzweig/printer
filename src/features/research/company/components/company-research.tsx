"use client";

import { useState, useEffect } from "react";
import { Search, Loader2, FileText, TrendingUp } from "lucide-react";

import { Button } from "@/lib/components/ui/button";
import { Input } from "@/lib/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/lib/components/ui/card";
import { Badge } from "@/lib/components/ui/badge";
import { Textarea } from "@/lib/components/ui/textarea";

import { useResearch } from "../hooks/use-research";
import { ResearchCompanyInput } from "@/features/agents/research-analyst";
import { processMarkdownToHtml } from "../utils/markdown-client";
import { ResearchList } from "./research-list";
import { useResearchContext } from "../providers/research-provider";

export function CompanyResearch() {
  const [ticker, setTicker] = useState("");
  const [researchFocus, setResearchFocus] = useState("");
  const [processedReport, setProcessedReport] = useState<string>("");
  
  const { result, loading, error, researchCompany } = useResearch();

  // Process markdown when result changes
  useEffect(() => {
    if (result?.report) {
      processMarkdownToHtml(result.report).then(setProcessedReport);
    } else {
      setProcessedReport("");
    }
  }, [result?.report]);

  const handleResearch = async () => {
    if (!ticker.trim()) return;

    const input: ResearchCompanyInput = {
      companyTicker: ticker.trim(),
      researchFocus: researchFocus.trim() ? researchFocus.split(',').map(f => f.trim()) : undefined,
    };

    await researchCompany(input);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Company Research</h1>
        <p className="text-muted-foreground mt-2">
          Get comprehensive investment analysis for any public company
        </p>
      </div>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Sidebar - Research List */}
        <div className="lg:col-span-1">
          <ResearchList />
        </div>

        {/* Right Content - Search Form and Results */}
        <div className="lg:col-span-2 space-y-6">

      {/* Search Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Research Company
          </CardTitle>
          <CardDescription>
            Enter a company ticker symbol to get detailed investment analysis
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <Input
              placeholder="Enter ticker symbol (e.g., AAPL, MSFT, TSLA)"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleResearch()}
              disabled={loading}
            />
            <Button 
              onClick={handleResearch} 
              disabled={loading || !ticker.trim()}
              className="min-w-[120px]"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Researching...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Research
                </>
              )}
            </Button>
          </div>
          
          <Textarea
            placeholder="Optional: Focus areas (e.g., financials, competitive analysis, growth prospects)"
            value={researchFocus}
            onChange={(e) => setResearchFocus(e.target.value)}
            disabled={loading}
            rows={2}
          />

          {error && (
            <div className="text-red-600 text-sm bg-red-50 p-3 rounded-md">
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Research Results */}
      {result && (
        <div className="space-y-4">
          {/* Company Header */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    {result.companyName} ({result.ticker})
                  </CardTitle>
                  <CardDescription>
                    Research completed on {result.createdAt.toLocaleDateString()}
                  </CardDescription>
                </div>
                <Badge variant="outline">Research Complete</Badge>
              </div>
            </CardHeader>
          </Card>

          {/* Executive Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Executive Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground leading-relaxed">
                {result.summary}
              </p>
            </CardContent>
          </Card>

          {/* Investment Recommendation */}
          <Card>
            <CardHeader>
              <CardTitle>Investment Recommendation</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="leading-relaxed">
                {result.recommendation}
              </p>
            </CardContent>
          </Card>

          {/* Full Report */}
          <Card>
            <CardHeader>
              <CardTitle>Detailed Research Report</CardTitle>
            </CardHeader>
            <CardContent>
              <div 
                className="prose prose-sm max-w-none markdown-content"
                dangerouslySetInnerHTML={{ __html: processedReport }}
              />
            </CardContent>
          </Card>
        </div>
      )}
        </div>
      </div>
    </div>
  );
}
