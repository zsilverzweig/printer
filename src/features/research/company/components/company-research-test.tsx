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
import { Input } from "@/lib/components/ui/input";
import { Label } from "@/lib/components/ui/label";
import { Textarea } from "@/lib/components/ui/textarea";

import { CompanyResearch } from "../types";

export function CompanyResearchTest() {
  const [ticker, setTicker] = useState("AAPL");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CompanyResearch | null>(null);
  const [error, setError] = useState<string | null>(null);

  const testResearch = async () => {
    if (!ticker.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/research/company", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          companyTicker: ticker.toUpperCase(),
          researchFocus: ["financials", "competitive_analysis", "growth_prospects"],
          additionalContext: {
            investmentThesis: "Looking for long-term growth potential",
            specificQuestions: ["What are the key growth drivers?", "What are the main competitive advantages?"]
          }
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create research");
      }

      const data = await response.json();
      const research = data.research;

      // Wait for research to complete (polling)
      let attempts = 0;
      const maxAttempts = 30; // 5 minutes max

      while (attempts < maxAttempts) {
        const statusResponse = await fetch(`/api/research/company/${research.id}`);
        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          const researchStatus = statusData.research;

          if (researchStatus.status === 'completed') {
            if (researchStatus.structuredResearch) {
              setResult(researchStatus.structuredResearch);
              return;
            } else {
              throw new Error("Research completed but no structured data found");
            }
          } else if (researchStatus.status === 'failed') {
            throw new Error(researchStatus.errorMessage || "Research failed");
          }
        }

        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
        attempts++;
      }

      throw new Error("Research timed out");

    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Test Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Test Company Research API</CardTitle>
          <CardDescription>
            Test the structured JSON research API with a company ticker symbol.
            The API will generate comprehensive research across all 8 domains.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Label htmlFor="ticker">Company Ticker</Label>
              <Input
                id="ticker"
                placeholder="AAPL"
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                className="mt-1"
              />
            </div>
            <div className="pt-6">
              <Button 
                onClick={testResearch} 
                disabled={loading || !ticker.trim()}
              >
                {loading ? "Researching..." : "Test Research"}
              </Button>
            </div>
          </div>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-red-800 text-sm">
                <strong>Error:</strong> {error}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle>Research Results - {result.companyOverview.companyName}</CardTitle>
            <CardDescription>
              Structured JSON research across all 8 domains
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Executive Summary */}
              <div>
                <h3 className="text-lg font-semibold mb-2">Executive Summary</h3>
                <div className="bg-gray-50 p-4 rounded-md">
                  <p className="mb-2"><strong>Investment Thesis:</strong> {result.executiveSummary.investmentThesis}</p>
                  <p className="mb-2"><strong>Recommendation:</strong> {result.executiveSummary.recommendation.toUpperCase()}</p>
                  <p className="mb-2"><strong>Target Price:</strong> ${result.executiveSummary.targetPrice}</p>
                  <p><strong>Time Horizon:</strong> {result.executiveSummary.timeHorizon}</p>
                </div>
              </div>

              {/* Key Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-blue-50 p-3 rounded-md">
                  <p className="text-sm text-blue-600">Market Cap</p>
                  <p className="font-semibold">${result.valuationAnalysis.currentValuation.marketCap.toLocaleString()}</p>
                </div>
                <div className="bg-green-50 p-3 rounded-md">
                  <p className="text-sm text-green-600">P/E Ratio</p>
                  <p className="font-semibold">{result.financialAnalysis.keyRatios.peRatio}</p>
                </div>
                <div className="bg-purple-50 p-3 rounded-md">
                  <p className="text-sm text-purple-600">Net Margin</p>
                  <p className="font-semibold">{result.financialAnalysis.profitability.netMargin}%</p>
                </div>
                <div className="bg-orange-50 p-3 rounded-md">
                  <p className="text-sm text-orange-600">Risk Level</p>
                  <p className="font-semibold">{result.riskAssessment.overallRiskLevel.toUpperCase()}</p>
                </div>
              </div>

              {/* Research Domains */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-semibold mb-2">Financial Analysis</h4>
                  <div className="text-sm space-y-1">
                    <p>• Revenue Growth: {result.financialAnalysis.revenueGrowth.currentYear}%</p>
                    <p>• Operating Margin: {result.financialAnalysis.profitability.operatingMargin}%</p>
                    <p>• ROE: {result.financialAnalysis.keyRatios.roe}%</p>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Competitive Analysis</h4>
                  <div className="text-sm space-y-1">
                    <p>• Market Share: {result.competitiveAnalysis.marketShare.primary}%</p>
                    <p>• Moat Strength: {result.competitiveAnalysis.moatStrength.toUpperCase()}</p>
                    <p>• Advantages: {result.competitiveAnalysis.competitiveAdvantages.length} identified</p>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Growth Prospects</h4>
                  <div className="text-sm space-y-1">
                    <p>• Short-term Growth: {result.growthProspects.revenueGrowth.shortTerm}%</p>
                    <p>• Long-term Growth: {result.growthProspects.revenueGrowth.longTerm}%</p>
                    <p>• Growth Drivers: {result.growthProspects.revenueGrowth.drivers.length} identified</p>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Valuation Analysis</h4>
                  <div className="text-sm space-y-1">
                    <p>• Fair Value: ${result.valuationAnalysis.valuationConclusion.fairValue}</p>
                    <p>• Upside: {result.valuationAnalysis.valuationConclusion.upside}%</p>
                    <p>• DCF Value: ${result.valuationAnalysis.valuationMethods.dcf.fairValue}</p>
                  </div>
                </div>
              </div>

              {/* Raw JSON */}
              <div>
                <h4 className="font-semibold mb-2">Raw JSON Structure</h4>
                <Textarea
                  value={JSON.stringify(result, null, 2)}
                  readOnly
                  className="h-64 text-xs font-mono"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
