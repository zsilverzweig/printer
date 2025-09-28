import { useCallback, useRef, useState } from "react";

import { log } from "@/lib/utils/logger";

import { Portfolio } from "../types";

export interface WizardStreamEvent {
  event: string;
  data: any;
  timestamp: string;
}

export interface WizardStreamStep {
  step: string;
  title: string;
  description: string;
  details?: string;
  duration?: number;
}

export interface UseWizardStreamReturn {
  isStreaming: boolean;
  currentStep: WizardStreamStep | null;
  completedSteps: string[];
  error: string | null;
  portfolio: Portfolio | null;
  startStream: (
    thesis: string,
    options?: { name?: string; description?: string; autoRefineThesis?: boolean }
  ) => Promise<void>;
  stopStream: () => void;
  events: WizardStreamEvent[];
}

export function useWizardStream(): UseWizardStreamReturn {
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentStep, setCurrentStep] = useState<WizardStreamStep | null>(null);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [events, setEvents] = useState<WizardStreamEvent[]>([]);

  const abortControllerRef = useRef<AbortController | null>(null);

  const startStream = useCallback(
    async (
      thesis: string,
      options: { name?: string; description?: string; autoRefineThesis?: boolean } = {}
    ) => {
      if (isStreaming) {
        log.warn("Wizard stream already in progress", {}, "useWizardStream");
        return;
      }

      setIsStreaming(true);
      setError(null);
      setCurrentStep(null);
      setCompletedSteps([]);
      setPortfolio(null);
      setEvents([]);

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        log.info(
          "Starting portfolio wizard stream",
          { thesisLength: thesis.length },
          "useWizardStream"
        );

        const response = await fetch("/api/portfolios/wizard/stream", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            thesis,
            name: options.name,
            description: options.description,
            autoRefineThesis: options.autoRefineThesis,
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("No response body reader available");
        }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            log.info(
              "Portfolio wizard stream completed",
              {},
              "useWizardStream"
            );
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const eventData = JSON.parse(
                  line.slice(6)
                ) as WizardStreamEvent;
                setEvents((prev) => [...prev, eventData]);

                log.info(
                  "Wizard stream event received",
                  {
                    event: eventData.event,
                    step: eventData.data.step,
                  },
                  "useWizardStream"
                );

                switch (eventData.event) {
                  case "step_start":
                    setCurrentStep({
                      step: eventData.data.step,
                      title: eventData.data.title,
                      description: eventData.data.description,
                    });
                    break;

                  case "step_complete":
                    setCompletedSteps((prev) => [...prev, eventData.data.step]);
                    setCurrentStep((prev) =>
                      prev
                        ? {
                            ...prev,
                            details: eventData.data.details,
                            duration: eventData.data.duration,
                          }
                        : null
                    );
                    break;

                  case "complete":
                    setPortfolio(eventData.data.portfolio);
                    setCurrentStep(null);
                    log.success(
                      "Portfolio wizard stream completed successfully",
                      {
                        portfolioId: eventData.data.portfolio.id,
                        positionCount:
                          eventData.data.portfolio.positions.length,
                      },
                      "useWizardStream"
                    );
                    break;

                  case "error":
                    setError(eventData.data.details || eventData.data.error);
                    setCurrentStep(null);
                    log.failure(
                      "Portfolio wizard stream failed",
                      {
                        error: eventData.data.details || eventData.data.error,
                      },
                      "useWizardStream"
                    );
                    break;
                }
              } catch (parseError) {
                log.warn(
                  "Failed to parse wizard stream event",
                  {
                    line,
                    error: parseError,
                  },
                  "useWizardStream"
                );
              }
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          log.info("Portfolio wizard stream aborted", {}, "useWizardStream");
        } else {
          const errorMessage =
            err instanceof Error ? err.message : "Unknown streaming error";
          setError(errorMessage);
          log.failure(
            "Portfolio wizard stream failed",
            {
              error: err,
              errorMessage,
            },
            "useWizardStream"
          );
        }
      } finally {
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    [isStreaming]
  );

  const stopStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setCurrentStep(null);
    log.info("Portfolio wizard stream stopped", {}, "useWizardStream");
  }, []);

  return {
    isStreaming,
    currentStep,
    completedSteps,
    error,
    portfolio,
    startStream,
    stopStream,
    events,
  };
}
