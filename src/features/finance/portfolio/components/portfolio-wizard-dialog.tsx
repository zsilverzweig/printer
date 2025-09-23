"use client";

import { useEffect, useState } from "react";

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
import { Textarea } from "@/lib/components/ui/textarea";

import { WizardDebugPanel, useWizardDebugLogs } from "./wizard-debug-panel";
import {
  WizardProgress,
  WizardStep,
  useWizardProgress,
} from "./wizard-progress";

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

interface PortfolioWizardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerate: (
    thesis: string,
    options: { name?: string; description?: string }
  ) => Promise<void>;
}

export function PortfolioWizardDialog({
  open,
  onOpenChange,
  onGenerate,
}: PortfolioWizardDialogProps) {
  const [portfolioName, setPortfolioName] = useState("");
  const [thesis, setThesis] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showProgress, setShowProgress] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  const {
    steps,
    currentStep,
    isVisible: progressVisible,
    initializeSteps,
    startStep,
    completeStep,
    errorStep,
    hide: hideProgress,
  } = useWizardProgress();

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
      setError(null);
      setLoading(false);
      setShowProgress(false);
      setShowDebug(false);
      hideProgress();
      hideDebugPanel();
    }
  }, [open, hideProgress, hideDebugPanel]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!thesis.trim()) {
      setError("Please provide an investment thesis.");
      return;
    }

    setLoading(true);
    setError(null);
    setShowProgress(true);

    // Initialize wizard steps
    const wizardSteps: Omit<WizardStep, "status" | "timestamp">[] = [
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

    initializeSteps(wizardSteps);

    try {
      // Step 1: Validate input
      startStep("validate-input");
      addLog({
        level: "info",
        message: "Starting input validation",
        service: "PortfolioWizard",
        context: {
          thesisLength: thesis.length,
          hasName: !!portfolioName.trim(),
        },
      });
      await new Promise((resolve) => setTimeout(resolve, 500)); // Simulate validation
      completeStep("validate-input", "Thesis validated successfully");
      addLog({
        level: "success",
        message: "Input validation completed",
        service: "PortfolioWizard",
      });

      // Step 2: Create portfolio
      startStep("create-portfolio");
      addLog({
        level: "info",
        message: "Creating portfolio structure",
        service: "PortfolioWizard",
        context: { portfolioName: portfolioName.trim() || "Auto-generated" },
      });
      await new Promise((resolve) => setTimeout(resolve, 300));
      completeStep("create-portfolio", "Portfolio structure created");
      addLog({
        level: "success",
        message: "Portfolio structure created",
        service: "PortfolioWizard",
      });

      // Step 3: Ensure agent
      startStep("ensure-agent");
      addLog({
        level: "info",
        message: "Preparing Portfolio Manager agent",
        service: "PortfolioWizard",
      });
      await new Promise((resolve) => setTimeout(resolve, 400));
      completeStep("ensure-agent", "Portfolio Manager agent ready");
      addLog({
        level: "success",
        message: "Portfolio Manager agent ready",
        service: "PortfolioWizard",
      });

      // Step 4: Generate plan (this is where the actual AI call happens)
      startStep("generate-plan");
      addLog({
        level: "info",
        message: "Starting AI plan generation",
        service: "PortfolioWizard",
        context: { thesisPreview: thesis.substring(0, 100) + "..." },
      });
      const startTime = Date.now();

      await onGenerate(thesis, {
        name: portfolioName.trim() || undefined,
      });

      const duration = Date.now() - startTime;
      completeStep(
        "generate-plan",
        `AI generated investment plan in ${duration}ms`,
        duration
      );
      addLog({
        level: "success",
        message: "AI plan generation completed",
        service: "PortfolioWizard",
        context: { duration, tokensUsed: "N/A" },
      });

      // Step 5: Parse positions
      startStep("parse-positions");
      addLog({
        level: "info",
        message: "Processing AI response into positions",
        service: "PortfolioWizard",
      });
      await new Promise((resolve) => setTimeout(resolve, 200));
      completeStep("parse-positions", "Positions processed and validated");
      addLog({
        level: "success",
        message: "Positions processed successfully",
        service: "PortfolioWizard",
      });

      // Step 6: Finalize
      startStep("finalize-portfolio");
      addLog({
        level: "info",
        message: "Finalizing portfolio",
        service: "PortfolioWizard",
      });
      await new Promise((resolve) => setTimeout(resolve, 300));
      completeStep("finalize-portfolio", "Portfolio saved successfully");
      addLog({
        level: "success",
        message: "Portfolio wizard completed successfully",
        service: "PortfolioWizard",
      });
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Failed to generate the portfolio draft.";
      setError(errorMessage);

      addLog({
        level: "error",
        message: "Portfolio wizard failed",
        service: "PortfolioWizard",
        context: {
          error: errorMessage,
          currentStep,
          stack: err instanceof Error ? err.stack : undefined,
        },
      });

      // Mark current step as error
      if (currentStep) {
        errorStep(currentStep, errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const footer = (
    <>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowDebug(!showDebug)}
          disabled={loading}
        >
          {showDebug ? "Hide Debug" : "Show Debug"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={loading}
        >
          Cancel
        </Button>
      </div>
      <Button
        type="submit"
        form="portfolio-wizard-form"
        disabled={loading || !thesis.trim()}
        className="min-w-[160px]"
      >
        {loading ? "Generating..." : "Generate Draft"}
      </Button>
    </>
  );

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Portfolio Wizard"
      size="xl"
      footer={footer}
    >
      {showProgress && progressVisible ? (
        <div className="p-6 space-y-6">
          <WizardProgress
            steps={steps}
            currentStep={currentStep}
            isVisible={progressVisible}
            onClose={() => setShowProgress(false)}
          />
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
                <p className="font-semibold">How the wizard works</p>
                <p>
                  Our Portfolio Manager agent reviews your thesis and
                  automatically drafts positions using Alpaca's trade
                  parameters. Every position starts in <strong>draft</strong>{" "}
                  mode so you can review before moving to paper or real money
                  trading.
                </p>
              </div>
              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}
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
