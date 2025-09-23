"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/lib/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import { Progress } from "@/lib/components/ui/progress";

export interface WizardStep {
  id: string;
  title: string;
  description: string;
  status: "pending" | "in_progress" | "completed" | "error";
  duration?: number;
  details?: string;
  timestamp?: string;
}

interface WizardProgressProps {
  steps: WizardStep[];
  currentStep?: string;
  isVisible: boolean;
  onClose?: () => void;
}

export function WizardProgress({
  steps,
  currentStep,
  isVisible,
  onClose,
}: WizardProgressProps) {
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [errorSteps, setErrorSteps] = useState<string[]>([]);

  useEffect(() => {
    const completed = steps
      .filter((step) => step.status === "completed")
      .map((step) => step.id);
    setCompletedSteps(completed);

    const errors = steps
      .filter((step) => step.status === "error")
      .map((step) => step.id);
    setErrorSteps(errors);
  }, [steps]);

  const getStepIcon = (step: WizardStep) => {
    switch (step.status) {
      case "completed":
        return "✅";
      case "in_progress":
        return "🔄";
      case "error":
        return "❌";
      default:
        return "⏳";
    }
  };

  const getStepBadgeVariant = (step: WizardStep) => {
    switch (step.status) {
      case "completed":
        return "default";
      case "in_progress":
        return "secondary";
      case "error":
        return "destructive";
      default:
        return "outline";
    }
  };

  const overallProgress =
    steps.length > 0 ? (completedSteps.length / steps.length) * 100 : 0;

  if (!isVisible) return null;

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Portfolio Wizard Progress</CardTitle>
          {onClose && (
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          )}
        </div>
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-gray-600">
            <span>Overall Progress</span>
            <span>{Math.round(overallProgress)}%</span>
          </div>
          <Progress value={overallProgress} className="h-2" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className={`flex items-start space-x-3 p-3 rounded-lg border ${
                step.status === "in_progress"
                  ? "border-blue-200 bg-blue-50"
                  : step.status === "error"
                  ? "border-red-200 bg-red-50"
                  : step.status === "completed"
                  ? "border-green-200 bg-green-50"
                  : "border-gray-200 bg-gray-50"
              }`}
            >
              <div className="flex-shrink-0 mt-0.5">
                <span className="text-lg">{getStepIcon(step)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-gray-900">
                    {step.title}
                  </h4>
                  <Badge
                    variant={getStepBadgeVariant(step)}
                    className="text-xs"
                  >
                    {step.status.replace("_", " ")}
                  </Badge>
                </div>
                <p className="text-sm text-gray-600 mt-1">{step.description}</p>
                {step.details && (
                  <p className="text-xs text-gray-500 mt-2 font-mono bg-white p-2 rounded border">
                    {step.details}
                  </p>
                )}
                {step.duration && (
                  <p className="text-xs text-gray-500 mt-1">
                    Duration: {step.duration}ms
                  </p>
                )}
                {step.timestamp && (
                  <p className="text-xs text-gray-500">
                    {new Date(step.timestamp).toLocaleTimeString()}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Hook for managing wizard progress
export function useWizardProgress() {
  const [steps, setSteps] = useState<WizardStep[]>([]);
  const [currentStep, setCurrentStep] = useState<string | undefined>();
  const [isVisible, setIsVisible] = useState(false);

  const initializeSteps = (
    stepDefinitions: Omit<WizardStep, "status" | "timestamp">[]
  ) => {
    const initialSteps = stepDefinitions.map((step) => ({
      ...step,
      status: "pending" as const,
      timestamp: new Date().toISOString(),
    }));
    setSteps(initialSteps);
    setIsVisible(true);
  };

  const updateStep = (stepId: string, updates: Partial<WizardStep>) => {
    setSteps((prev) =>
      prev.map((step) =>
        step.id === stepId
          ? { ...step, ...updates, timestamp: new Date().toISOString() }
          : step
      )
    );
  };

  const startStep = (stepId: string) => {
    setCurrentStep(stepId);
    updateStep(stepId, { status: "in_progress" });
  };

  const completeStep = (
    stepId: string,
    details?: string,
    duration?: number
  ) => {
    updateStep(stepId, {
      status: "completed",
      details,
      duration,
    });
    setCurrentStep(undefined);
  };

  const errorStep = (stepId: string, details?: string, duration?: number) => {
    updateStep(stepId, {
      status: "error",
      details,
      duration,
    });
    setCurrentStep(undefined);
  };

  const hide = () => setIsVisible(false);
  const show = () => setIsVisible(true);

  return {
    steps,
    currentStep,
    isVisible,
    initializeSteps,
    updateStep,
    startStep,
    completeStep,
    errorStep,
    hide,
    show,
  };
}
