"use client";

import { useState } from "react";

import { Badge } from "@/lib/components/ui/badge";
import { Button } from "@/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/lib/components/ui/tabs";

interface DebugLogEntry {
  timestamp: string;
  level: "info" | "success" | "warning" | "error";
  message: string;
  context?: Record<string, any>;
  service: string;
}

interface WizardDebugPanelProps {
  logs: DebugLogEntry[];
  isVisible: boolean;
  onClose?: () => void;
}

export function WizardDebugPanel({
  logs,
  isVisible,
  onClose,
}: WizardDebugPanelProps) {
  const [selectedTab, setSelectedTab] = useState("logs");

  if (!isVisible) return null;

  const getLogIcon = (level: string) => {
    switch (level) {
      case "success":
        return "✅";
      case "warning":
        return "⚠️";
      case "error":
        return "❌";
      default:
        return "ℹ️";
    }
  };

  const getLogBadgeVariant = (level: string) => {
    switch (level) {
      case "success":
        return "default";
      case "warning":
        return "secondary";
      case "error":
        return "destructive";
      default:
        return "outline";
    }
  };

  const formatContext = (context: Record<string, any>) => {
    return JSON.stringify(context, null, 2);
  };

  const recentLogs = logs.slice(-20); // Show last 20 logs
  const errorLogs = logs.filter((log) => log.level === "error");
  const successLogs = logs.filter((log) => log.level === "success");

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Wizard Debug Panel</CardTitle>
          {onClose && (
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Badge variant="outline">Total: {logs.length}</Badge>
          <Badge variant="default">Success: {successLogs.length}</Badge>
          <Badge variant="destructive">Errors: {errorLogs.length}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={selectedTab} onValueChange={setSelectedTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="logs">All Logs</TabsTrigger>
            <TabsTrigger value="errors">Errors</TabsTrigger>
            <TabsTrigger value="success">Success</TabsTrigger>
          </TabsList>

          <TabsContent value="logs" className="mt-4">
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {recentLogs.map((log, index) => (
                <div
                  key={index}
                  className={`p-3 rounded-lg border text-sm ${
                    log.level === "error"
                      ? "border-red-200 bg-red-50"
                      : log.level === "warning"
                      ? "border-yellow-200 bg-yellow-50"
                      : log.level === "success"
                      ? "border-green-200 bg-green-50"
                      : "border-gray-200 bg-gray-50"
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span>{getLogIcon(log.level)}</span>
                      <Badge
                        variant={getLogBadgeVariant(log.level)}
                        className="text-xs"
                      >
                        {log.level}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {log.service}
                      </Badge>
                    </div>
                    <span className="text-xs text-gray-500">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="font-medium mb-2">{log.message}</p>
                  {log.context && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-gray-600 hover:text-gray-800">
                        Context Details
                      </summary>
                      <pre className="mt-2 p-2 bg-white rounded border text-xs overflow-x-auto">
                        {formatContext(log.context)}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="errors" className="mt-4">
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {errorLogs.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  No errors found
                </p>
              ) : (
                errorLogs.map((log, index) => (
                  <div
                    key={index}
                    className="p-3 rounded-lg border border-red-200 bg-red-50 text-sm"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span>❌</span>
                        <Badge variant="destructive" className="text-xs">
                          {log.service}
                        </Badge>
                      </div>
                      <span className="text-xs text-gray-500">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="font-medium mb-2 text-red-800">
                      {log.message}
                    </p>
                    {log.context && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-red-600 hover:text-red-800">
                          Error Details
                        </summary>
                        <pre className="mt-2 p-2 bg-white rounded border text-xs overflow-x-auto">
                          {formatContext(log.context)}
                        </pre>
                      </details>
                    )}
                  </div>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="success" className="mt-4">
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {successLogs.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  No success logs found
                </p>
              ) : (
                successLogs.map((log, index) => (
                  <div
                    key={index}
                    className="p-3 rounded-lg border border-green-200 bg-green-50 text-sm"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span>✅</span>
                        <Badge variant="default" className="text-xs">
                          {log.service}
                        </Badge>
                      </div>
                      <span className="text-xs text-gray-500">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="font-medium mb-2 text-green-800">
                      {log.message}
                    </p>
                    {log.context && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-green-600 hover:text-green-800">
                          Success Details
                        </summary>
                        <pre className="mt-2 p-2 bg-white rounded border text-xs overflow-x-auto">
                          {formatContext(log.context)}
                        </pre>
                      </details>
                    )}
                  </div>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// Hook for managing debug logs
export function useWizardDebugLogs() {
  const [logs, setLogs] = useState<DebugLogEntry[]>([]);
  const [isVisible, setIsVisible] = useState(false);

  const addLog = (entry: Omit<DebugLogEntry, "timestamp">) => {
    const logEntry: DebugLogEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
    };
    setLogs((prev) => [...prev, logEntry]);
  };

  const clearLogs = () => {
    setLogs([]);
  };

  const show = () => setIsVisible(true);
  const hide = () => setIsVisible(false);

  return {
    logs,
    isVisible,
    addLog,
    clearLogs,
    show,
    hide,
  };
}
