"use client";

import {
  AlertCircle,
  Bot,
  CheckCircle,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Play,
  Settings,
  XCircle,
} from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription } from "@/lib/components/ui/alert";
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
import { Label } from "@/lib/components/ui/label";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/lib/components/ui/tabs";
import { Textarea } from "@/lib/components/ui/textarea";
import { useUrlTabs } from "@/lib/hooks/use-url-tabs";

interface AIResponse {
  success: boolean;
  data?: any;
  error?: string;
  metadata?: {
    duration?: number;
    tokensUsed?: number;
    model?: string;
    isMockResponse?: boolean;
  };
}

export function AISandbox() {
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [thesis, setThesis] = useState(
    "I believe renewable energy stocks will outperform in 2024 due to government incentives and growing demand for clean energy solutions."
  );
  const [portfolioName, setPortfolioName] = useState("Test Portfolio");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<AIResponse | null>(null);
  const [activeTab, setActiveTab] = useUrlTabs({ defaultTab: "portfolio" });

  const testAIService = async () => {
    setLoading(true);
    setResponse(null);

    try {
      // Test the AI service by creating a simple portfolio
      const res = await fetch("/api/portfolios/wizard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thesis: "Test AI service functionality",
          name: "AI Service Test",
        }),
      });
      const data = await res.json();
      setResponse({
        success: !data.error,
        data: {
          message: "AI service is working",
          portfolio: data.portfolio,
          metadata: data.metadata,
        },
        error: data.error,
        metadata: {
          duration: data.metadata?.duration,
        },
      });
    } catch (error) {
      setResponse({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  };

  const testPortfolioGeneration = async () => {
    setLoading(true);
    setResponse(null);

    try {
      const res = await fetch("/api/portfolios/wizard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thesis,
          name: portfolioName,
        }),
      });
      const data = await res.json();
      setResponse({
        success: !data.error,
        data: data.portfolio,
        error: data.error,
        metadata: {
          duration: data.metadata?.duration,
        },
      });
    } catch (error) {
      setResponse({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  };

  const testDebugPortfolio = async () => {
    setLoading(true);
    setResponse(null);

    try {
      // Use the streaming wizard for detailed debugging
      const res = await fetch("/api/portfolios/wizard/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thesis,
          name: portfolioName,
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error("No response body reader available");
      }

      const decoder = new TextDecoder();
      let buffer = "";
      const events: any[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const eventData = JSON.parse(line.slice(6));
              events.push(eventData);
            } catch (parseError) {
              console.warn("Failed to parse event:", line);
            }
          }
        }
      }

      setResponse({
        success: true,
        data: {
          message: "Streaming debug completed",
          events,
          totalEvents: events.length,
          completedSteps: events.filter((e) => e.event === "step_complete")
            .length,
          finalPortfolio: events.find((e) => e.event === "complete")?.data
            ?.portfolio,
        },
        metadata: {},
      });
    } catch (error) {
      setResponse({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const formatResponse = (data: any) => {
    try {
      return JSON.stringify(data, null, 2);
    } catch (error) {
      return `Error formatting response: ${error}`;
    }
  };

  return (
    <div className="space-y-6">
      {/* API Key Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            OpenAI Configuration
          </CardTitle>
          <CardDescription>
            Configure your OpenAI API key for AI functionality
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="api-key">OpenAI API Key</Label>
            <div className="flex gap-2">
              <Input
                id="api-key"
                type={showApiKey ? "text" : "password"}
                value={openaiApiKey}
                onChange={(e) => setOpenaiApiKey(e.target.value)}
                placeholder="sk-..."
                className="flex-1"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                {showApiKey ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              API key is stored locally in your browser. Set the OPENAI_API_KEY
              environment variable for production use.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* AI Testing Tabs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            AI Testing Sandbox
          </CardTitle>
          <CardDescription>
            Test different AI functions and see their responses
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="portfolio">Portfolio Generation</TabsTrigger>
              <TabsTrigger value="ai-service">AI Service</TabsTrigger>
              <TabsTrigger value="debug">Debug</TabsTrigger>
            </TabsList>

            <TabsContent value="portfolio" className="space-y-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="portfolio-name">Portfolio Name</Label>
                  <Input
                    id="portfolio-name"
                    value={portfolioName}
                    onChange={(e) => setPortfolioName(e.target.value)}
                    placeholder="Enter portfolio name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="thesis">Investment Thesis</Label>
                  <Textarea
                    id="thesis"
                    value={thesis}
                    onChange={(e) => setThesis(e.target.value)}
                    placeholder="Enter your investment thesis..."
                    rows={4}
                  />
                </div>
                <Button
                  onClick={testPortfolioGeneration}
                  disabled={loading || !thesis.trim()}
                  className="w-full"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Generating Portfolio...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Test Portfolio Generation
                    </>
                  )}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="ai-service" className="space-y-4">
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Test the basic AI service functionality by generating a simple
                  portfolio.
                </p>
                <Button
                  onClick={testAIService}
                  disabled={loading}
                  className="w-full"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Testing AI Service...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Test AI Service
                    </>
                  )}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="debug" className="space-y-4">
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Debug portfolio generation using the streaming wizard to see
                  step-by-step progress and detailed events.
                </p>
                <Button
                  onClick={testDebugPortfolio}
                  disabled={loading || !thesis.trim()}
                  className="w-full"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Debugging...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Debug Portfolio Generation
                    </>
                  )}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Response Display */}
      {response && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                {response.success ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600" />
                )}
                Response
              </CardTitle>
              <div className="flex items-center gap-2">
                {response.metadata && (
                  <div className="flex gap-2">
                    {response.metadata.duration && (
                      <Badge variant="outline">
                        {response.metadata.duration}ms
                      </Badge>
                    )}
                    {response.metadata.isMockResponse && (
                      <Badge variant="secondary">Mock Response</Badge>
                    )}
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(formatResponse(response))}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {response.error ? (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>{response.error}</AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-4">
                <pre className="bg-gray-100 p-4 rounded-lg overflow-auto text-sm max-h-96">
                  {formatResponse(response.data)}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
