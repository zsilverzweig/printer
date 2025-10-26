"use client";

import {
  CheckCircle2,
  FileText,
  Loader,
  Loader2,
  Search,
  TrendingUp,
} from "lucide-react";
import { useEffect, useState } from "react";

import { ResearchCompanyInput } from "@/features/agents/research-analyst";
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
import { Textarea } from "@/lib/components/ui/textarea";

import { useResearch } from "../hooks/use-research";
import { processMarkdownToHtml } from "../utils/markdown-client";

import { ResearchList } from "./research-list";

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
      researchFocus: researchFocus.trim()
        ? researchFocus.split(",").map((f) => f.trim())
        : undefined,
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
                Enter a company ticker symbol to get detailed investment
                analysis
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4">
                <Input
                  placeholder="Enter ticker symbol (e.g., AAPL, MSFT, TSLA)"
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && handleResearch()}
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
              {/* Status Banner */}
              {result.status && result.status !== "completed" ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Loader className="h-5 w-5 animate-spin" />
                      {result.status}
                    </CardTitle>
                  </CardHeader>
                </Card>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      Research Complete
                    </CardTitle>
                  </CardHeader>
                </Card>
              )}
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
                        Research completed on{" "}
                        {result.createdAt.toLocaleDateString()}
                      </CardDescription>
                    </div>
                    <Badge
                      variant={
                        result.status === "completed" ? "default" : "outline"
                      }
                    >
                      {result.status === "completed"
                        ? "Completed"
                        : "In Progress"}
                    </Badge>
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

              {/* Background (CRU) */}
              {result.background && (
                <Card>
                  <CardHeader>
                    <CardTitle>Background</CardTitle>
                    <CardDescription>
                      Executive summary and detailed report from the research
                      phase
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <h4 className="font-medium mb-2">Summary</h4>
                      <p className="text-sm text-muted-foreground">
                        {result.background.summary}
                      </p>
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">Report</h4>
                      <div
                        className="prose prose-sm max-w-none markdown-content"
                        dangerouslySetInnerHTML={{ __html: processedReport }}
                      />
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Recent News (CRU) */}
              {result.recentNews && (
                <Card>
                  <CardHeader>
                    <CardTitle>Recent News</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      {result.recentNews.summary}
                    </p>
                    {result.recentNews.keyDevelopments?.length ? (
                      <div>
                        <h4 className="font-medium mb-2">Key Developments</h4>
                        <ul className="list-disc pl-5 text-sm">
                          {result.recentNews.keyDevelopments.map(
                            (item, idx) => (
                              <li key={idx}>{item}</li>
                            )
                          )}
                        </ul>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              )}

              {/* Synthesis (CRU) */}
              {result.synthesis && (
                <Card>
                  <CardHeader>
                    <CardTitle>Synthesis</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <h4 className="font-medium mb-2">Synthesis</h4>
                      <p className="text-sm text-muted-foreground">
                        {result.synthesis.synthesis}
                      </p>
                    </div>
                    {!!result.synthesis.keyInsights?.length && (
                      <div>
                        <h4 className="font-medium mb-2">Key Insights</h4>
                        <ul className="list-disc pl-5 text-sm">
                          {result.synthesis.keyInsights.map((item, idx) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {!!result.synthesis.riskFactors?.length && (
                      <div>
                        <h4 className="font-medium mb-2">Risk Factors</h4>
                        <ul className="list-disc pl-5 text-sm">
                          {result.synthesis.riskFactors.map((item, idx) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Investment Recommendation */}
              <Card>
                <CardHeader>
                  <CardTitle>Investment Recommendation</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="leading-relaxed">{result.recommendation}</p>
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
