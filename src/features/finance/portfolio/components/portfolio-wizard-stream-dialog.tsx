"use client";

import { useEffect, useRef, useState } from "react";

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
import {
  Modal,
  ModalField,
  ModalForm,
  ModalSection,
} from "@/lib/components/ui/modal";
import { Progress } from "@/lib/components/ui/progress";
import { Textarea } from "@/lib/components/ui/textarea";

import { useWizardStream } from "../hooks/use-wizard-stream";
import { WizardDebugPanel, useWizardDebugLogs } from "./wizard-debug-panel";

const SAMPLE_THESES = [
  {
    title: "AI Infrastructure Expansion",
    summary:
      "Investing behind hyperscale spending on GPUs, networking, and power.",
    thesis:
      "I believe hyperscale cloud providers will continue to expand capital expenditures into AI compute. NVIDIA, Broadcom, and companies tied to advanced packaging, power management, and data center construction should compound revenues as enterprises race to deploy AI workloads over the next 12-18 months.",
  },
  {
    title: "Energy Transition Enablers",
    summary:
      "Utilities and grid software players ride structural decarbonization tailwinds.",
    thesis:
      "Policy incentives, grid reliability mandates, and falling battery costs are creating a multi-year investment cycle in transmission upgrades and energy storage. Companies delivering grid automation software, high-voltage equipment, and battery supply chains should see durable orders as utilities modernize infrastructure.",
  },
  {
    title: "Premium Consumer Resilience",
    summary:
      "High-income demand supports luxury travel, apparel, and experiences.",
    thesis:
      "Despite macro volatility, affluent consumers continue to prioritize experiential spending and trusted premium brands. Luxury apparel leaders, upscale travel platforms, and differentiated leisure names with pricing power can continue to grow as they capture wallet share from mid-tier discretionary categories that are under pressure.",
  },
] as const;

interface PortfolioWizardStreamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: (portfolio: any) => void;
}

export function PortfolioWizardStreamDialog({
  open,
  onOpenChange,
  onComplete,
}: PortfolioWizardStreamDialogProps) {
  const [portfolioName, setPortfolioName] = useState("");
  const [thesis, setThesis] = useState("");
  const [showDebug, setShowDebug] = useState(false);
  const hasCompletedRef = useRef(false);

  const {
    isStreaming,
    currentStep,
    completedSteps,
    error,
    portfolio,
    startStream,
    stopStream,
    events,
  } = useWizardStream();

  const {
    logs: debugLogs,
    isVisible: debugVisible,
    addLog,
    show: showDebugPanel,
    hide: hideDebugPanel,
  } = useWizardDebugLogs();

  useEffect(() => {
    if (!open) {
      setPortfolioName("");
      setThesis("");
      setShowDebug(false);
      stopStream();
      hideDebugPanel();
      hasCompletedRef.current = false;
    }
  }, [open, stopStream, hideDebugPanel]);

  useEffect(() => {
    if (portfolio && !isStreaming && !hasCompletedRef.current) {
      hasCompletedRef.current = true;
      const handleComplete = async () => {
        try {
          await onComplete(portfolio);
        } catch (error) {
          console.error("Error in completion handler:", error);
        } finally {
          onOpenChange(false);
        }
      };
      handleComplete();
    }
  }, [portfolio, isStreaming, onComplete, onOpenChange]);

  // Convert stream events to debug logs
  useEffect(() => {
    // Only process new events to avoid infinite loops
    const newEvents = events.slice(debugLogs.length);
    newEvents.forEach((event) => {
      addLog({
        level:
          event.event === "error"
            ? "error"
            : event.event === "step_complete"
            ? "success"
            : "info",
        message: event.data.details || event.data.title || event.event,
        service: "WizardStream",
        context: event.data,
      });
    });
  }, [events.length, addLog, debugLogs.length]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!thesis.trim()) {
      return;
    }

    await startStream(thesis, {
      name: portfolioName.trim() || undefined,
    });
  };

  const getStepIcon = (step: string) => {
    if (completedSteps.includes(step)) return "✅";
    if (currentStep?.step === step) return "🔄";
    return "⏳";
  };

  const getStepBadgeVariant = (step: string) => {
    if (completedSteps.includes(step)) return "default";
    if (currentStep?.step === step) return "secondary";
    return "outline";
  };

  const allSteps = [
    {
      id: "validate-input",
      title: "Validating Input",
      description: "Checking thesis and portfolio parameters",
    },
    {
      id: "create-portfolio",
      title: "Creating Portfolio",
      description: "Setting up portfolio structure and metadata",
    },
    {
      id: "ensure-agent",
      title: "Preparing AI Agent",
      description: "Loading Portfolio Manager agent configuration",
    },
    {
      id: "generate-plan",
      title: "Generating Investment Plan",
      description: "AI agent analyzing thesis and creating positions",
    },
    {
      id: "parse-positions",
      title: "Processing Positions",
      description: "Converting AI response into trade-ready positions",
    },
    {
      id: "finalize-portfolio",
      title: "Finalizing Portfolio",
      description: "Saving portfolio with generated positions",
    },
  ];

  const overallProgress =
    allSteps.length > 0 ? (completedSteps.length / allSteps.length) * 100 : 0;

  const footer = (
    <>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowDebug(!showDebug)}
          disabled={isStreaming}
        >
          {showDebug ? "Hide Debug" : "Show Debug"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (isStreaming) {
              stopStream();
            }
            onOpenChange(false);
          }}
        >
          Cancel
        </Button>
        {isStreaming && (
          <Button type="button" variant="destructive" onClick={stopStream}>
            Stop
          </Button>
        )}
      </div>
      <Button
        type="submit"
        form="portfolio-wizard-form"
        disabled={isStreaming || !thesis.trim()}
        className="min-w-[160px]"
      >
        {isStreaming ? "Generating..." : "Generate Draft"}
      </Button>
    </>
  );

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Portfolio Wizard (Streaming)"
      size="xl"
      footer={footer}
    >
      {isStreaming || completedSteps.length > 0 ? (
        <div className="p-6 space-y-6">
          {/* Progress Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Portfolio Generation Progress
              </CardTitle>
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Overall Progress</span>
                  <span>{Math.round(overallProgress)}%</span>
                </div>
                <Progress value={overallProgress} className="h-2" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {allSteps.map((step) => (
                  <div
                    key={step.id}
                    className={`flex items-start space-x-3 p-3 rounded-lg border ${
                      completedSteps.includes(step.id)
                        ? "border-green-200 bg-green-50"
                        : currentStep?.step === step.id
                        ? "border-blue-200 bg-blue-50"
                        : "border-gray-200 bg-gray-50"
                    }`}
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      <span className="text-lg">{getStepIcon(step.id)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium text-gray-900">
                          {step.title}
                        </h4>
                        <Badge
                          variant={getStepBadgeVariant(step.id)}
                          className="text-xs"
                        >
                          {completedSteps.includes(step.id)
                            ? "completed"
                            : currentStep?.step === step.id
                            ? "in progress"
                            : "pending"}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        {step.description}
                      </p>
                      {currentStep?.step === step.id && currentStep.details && (
                        <p className="text-xs text-blue-600 mt-2 font-mono bg-white p-2 rounded border">
                          {currentStep.details}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {error && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="p-4">
                <div className="text-red-800">
                  <h3 className="font-semibold mb-2">Error</h3>
                  <p>{error}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {showDebug && (
            <WizardDebugPanel
              logs={debugLogs}
              isVisible={showDebug}
              onClose={() => setShowDebug(false)}
            />
          )}
        </div>
      ) : showDebug ? (
        <div className="p-6">
          <WizardDebugPanel
            logs={debugLogs}
            isVisible={showDebug}
            onClose={() => setShowDebug(false)}
          />
        </div>
      ) : (
        <ModalForm id="portfolio-wizard-form" onSubmit={handleSubmit}>
          <ModalSection title="Tell us about your thesis">
            <div className="space-y-4">
              <ModalField label="Portfolio Name (optional)">
                <Input
                  value={portfolioName}
                  onChange={(event) => setPortfolioName(event.target.value)}
                  placeholder="e.g., AI Infrastructure Draft"
                />
              </ModalField>
              <ModalField label="Investment Thesis" required>
                <Textarea
                  value={thesis}
                  onChange={(event) => setThesis(event.target.value)}
                  placeholder="Share the core idea, catalysts, and risk considerations behind your investment thesis."
                  rows={8}
                />
              </ModalField>
              <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 space-y-1">
                <p className="font-semibold">How the streaming wizard works</p>
                <p>
                  Our Portfolio Manager agent reviews your thesis and
                  automatically drafts positions using Alpaca's trade
                  parameters. This version shows real-time progress as the AI
                  works through each step.
                </p>
              </div>
            </div>
          </ModalSection>

          <ModalSection title="Need inspiration?" className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Use one of the sample theses below to see how the Portfolio
              Manager transforms a narrative into structured positions.
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {SAMPLE_THESES.map((sample) => (
                <Card
                  key={sample.title}
                  className="flex h-full flex-col justify-between border-border/60"
                >
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{sample.title}</CardTitle>
                    <CardDescription>{sample.summary}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col justify-between gap-4">
                    <p className="text-sm text-muted-foreground line-clamp-6">
                      {sample.thesis}
                    </p>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setThesis(sample.thesis)}
                    >
                      Use this thesis
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ModalSection>
        </ModalForm>
      )}
    </Modal>
  );
}
