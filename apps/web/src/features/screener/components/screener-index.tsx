"use client";

import { Edit2, History, Loader2, Play, Plus, Trash2 } from "lucide-react";
import React from "react";

import type {
  ScreenerRunResult,
  ScreeningCriteria,
} from "../hooks/use-screeners";
import { useScreeners } from "../hooks/use-screeners";

import { ScreenerEditDialog } from "./screener-edit-dialog";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/lib/components/ui/alert-dialog";
import { Button } from "@/lib/components/ui/button";
import { DateTimePicker } from "@/lib/components/ui/date-time-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/lib/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/lib/components/ui/table";

interface ScreenerIndexProps {
  screeners: ScreeningCriteria[];
  loading: boolean;
  onScreenerSelect?: (screenerId: string) => void;
}

export function ScreenerIndex({
  screeners,
  loading,
  onScreenerSelect,
}: ScreenerIndexProps) {
  const { runScreenerWithCriteria, saveScreener, deleteScreener } =
    useScreeners();
  const [runningScreenerIds, setRunningScreenerIds] = React.useState<
    Set<string>
  >(new Set());
  const [screenerRunResults, setScreenerRunResults] = React.useState<
    Record<string, ScreenerRunResult | null>
  >({});
  const [editDialogOpen, setEditDialogOpen] = React.useState(false);
  const [editingScreener, setEditingScreener] =
    React.useState<ScreeningCriteria | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [deletingScreener, setDeletingScreener] =
    React.useState<ScreeningCriteria | null>(null);
  const [editName, setEditName] = React.useState("");
  const [editDescription, setEditDescription] = React.useState("");
  const [historicalDialogOpen, setHistoricalDialogOpen] = React.useState(false);
  const [historicalScreener, setHistoricalScreener] =
    React.useState<ScreeningCriteria | null>(null);
  const [historicalTimestamp, setHistoricalTimestamp] = React.useState<
    Date | undefined
  >(undefined);
  const [historicalRunning, setHistoricalRunning] = React.useState(false);
  const [runAllHistoricalTimestamp, setRunAllHistoricalTimestamp] =
    React.useState<Date | undefined>(new Date());
  const [runAllHistoricalRunning, setRunAllHistoricalRunning] =
    React.useState(false);

  const runScreenerTracked = React.useCallback(
    async (
      screener: ScreeningCriteria,
      runner: () => Promise<ScreenerRunResult | null>
    ) => {
      const screenerId = screener.id;
      setRunningScreenerIds((prev) => {
        const next = new Set(prev);
        next.add(screenerId);
        return next;
      });
      try {
        const result = await runner();
        setScreenerRunResults((prev) => ({
          ...prev,
          [screenerId]: result,
        }));
        return result;
      } catch (error) {
        console.error("Error running screener:", error);
        setScreenerRunResults((prev) => ({
          ...prev,
          [screenerId]: null,
        }));
        return null;
      } finally {
        setRunningScreenerIds((prev) => {
          const next = new Set(prev);
          next.delete(screenerId);
          return next;
        });
      }
    },
    [setRunningScreenerIds, setScreenerRunResults]
  );

  const handleRunScreener = async (screener: ScreeningCriteria) => {
    await runScreenerTracked(screener, () =>
      runScreenerWithCriteria(screener.criteria)
    );
  };

  const handleRunAll = async () => {
    for (const screener of screeners) {
      await handleRunScreener(screener);
    }
  };

  const handleCreate = () => {
    setEditingScreener(null);
    setEditName("");
    setEditDescription("");
    setEditDialogOpen(true);
  };

  const handleEdit = (screener: ScreeningCriteria) => {
    setEditingScreener(screener);
    setEditName(screener.name);
    setEditDescription(screener.description || "");
    setEditDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editName.trim()) {
      return;
    }

    const screenerData = {
      ...(editingScreener ? editingScreener : {}),
      name: editName,
      description: editDescription,
      criteria: editingScreener?.criteria
        ? {
            ...editingScreener.criteria,
            limit: editingScreener.criteria.limit ?? 200,
          }
        : {
            limit: 200,
          },
    };

    const saved = await saveScreener(screenerData as any);
    if (saved) {
      setEditDialogOpen(false);
      setEditingScreener(null);
      // State is already updated by saveScreener, no need to reload
    }
  };

  const handleDeleteClick = (screener: ScreeningCriteria) => {
    setDeletingScreener(screener);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingScreener) return;

    const success = await deleteScreener(deletingScreener.id);
    if (success) {
      setDeleteDialogOpen(false);
      setDeletingScreener(null);
      // Clear selection if the deleted screener was selected
      if (onScreenerSelect && deletingScreener.id) {
        onScreenerSelect("");
      }
      // State is already updated by deleteScreener, no need to reload
      setScreenerRunResults((prev) => {
        const next = { ...prev };
        delete next[deletingScreener.id];
        return next;
      });
    }
  };

  const handleOpenHistoricalDialog = (screener: ScreeningCriteria) => {
    setHistoricalScreener(screener);
    setHistoricalTimestamp(new Date());
    setHistoricalDialogOpen(true);
  };

  const handleHistoricalRun = async () => {
    if (!historicalScreener || !historicalTimestamp) {
      return;
    }

    const screenerId = historicalScreener.id;
    setHistoricalRunning(true);
    try {
      await runScreenerTracked(historicalScreener, () =>
        runScreenerWithCriteria(
          historicalScreener.criteria,
          historicalTimestamp
        )
      );
      setHistoricalDialogOpen(false);
      setHistoricalScreener(null);
      setHistoricalTimestamp(undefined);
    } catch (error) {
      console.error("Error running historical screener:", error);
    } finally {
      setHistoricalRunning(false);
    }
  };

  const handleHistoricalDialogChange = (open: boolean) => {
    setHistoricalDialogOpen(open);
    if (!open) {
      setHistoricalScreener(null);
      setHistoricalTimestamp(undefined);
      setHistoricalRunning(false);
    }
  };

  const handleRunAllHistorical = async () => {
    if (!runAllHistoricalTimestamp) {
      return;
    }

    setRunAllHistoricalRunning(true);
    try {
      for (const screener of screeners) {
        await runScreenerTracked(screener, () =>
          runScreenerWithCriteria(screener.criteria, runAllHistoricalTimestamp)
        );
      }
    } catch (error) {
      console.error("Error running historical screeners:", error);
    } finally {
      setRunAllHistoricalRunning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Screener Index</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {screeners.length} screener{screeners.length !== 1 ? "s" : ""}{" "}
              configured
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Button onClick={handleCreate} variant="default">
              <Plus className="h-4 w-4 mr-2" />
              Create Screener
            </Button>
            <Button
              onClick={handleRunAll}
              disabled={
                screeners.length === 0 ||
                runningScreenerIds.size > 0 ||
                runAllHistoricalRunning
              }
              variant="outline"
            >
              <Play className="h-4 w-4 mr-2" />
              Run All
            </Button>
            <div className="flex items-center gap-2">
              <DateTimePicker
                date={runAllHistoricalTimestamp}
                onDateChange={setRunAllHistoricalTimestamp}
                placeholder="Pick date & time"
                showTime
                disabled={
                  runAllHistoricalRunning || runningScreenerIds.size > 0
                }
                className="w-[220px]"
              />
              <Button
                onClick={handleRunAllHistorical}
                disabled={
                  screeners.length === 0 ||
                  !runAllHistoricalTimestamp ||
                  runAllHistoricalRunning ||
                  runningScreenerIds.size > 0
                }
                variant="outline"
              >
                {runAllHistoricalRunning ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Running Historical…
                  </>
                ) : (
                  <>
                    <History className="h-4 w-4 mr-2" />
                    Run All Historical
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {screeners.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p className="mb-4">No screeners configured.</p>
            <Button onClick={handleCreate} variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Screener
            </Button>
          </div>
        ) : (
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Count</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {screeners.map((screener) => {
                  const isRunning = runningScreenerIds.has(screener.id);
                  const runResult = screenerRunResults[screener.id];
                  const count = runResult?.ticker_count;
                  const breakdown = runResult?.filter_breakdown;
                  return (
                    <TableRow key={screener.id}>
                      <TableCell className="font-medium">
                        <button
                          onClick={() => onScreenerSelect?.(screener.id)}
                          className="hover:underline text-left"
                        >
                          {screener.name}
                        </button>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {screener.description || "—"}
                      </TableCell>
                      <TableCell>
                        {count !== undefined ? (
                          <div>
                            <span className="font-semibold">
                              {count.toLocaleString()}
                            </span>
                            {breakdown && breakdown.length > 0 ? (
                              <div className="mt-3 max-h-48 overflow-y-auto rounded-md border border-border/60 bg-muted/30 p-3 text-xs space-y-2">
                                {breakdown.map((step) => {
                                  const removedDisplay =
                                    step.removed && step.removed > 0
                                      ? `(-${step.removed.toLocaleString()})`
                                      : null;
                                  return (
                                    <div
                                      key={step.label}
                                      className="flex items-start justify-between gap-4"
                                    >
                                      <span className="text-muted-foreground">
                                        {step.label}
                                      </span>
                                      <span className="whitespace-nowrap text-right font-medium text-foreground">
                                        {step.count.toLocaleString()}
                                        {removedDisplay ? (
                                          <span className="ml-2 text-muted-foreground">
                                            {removedDisplay}
                                          </span>
                                        ) : null}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRunScreener(screener)}
                            disabled={isRunning}
                          >
                            {isRunning ? (
                              <>
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                Running...
                              </>
                            ) : (
                              <>
                                <Play className="h-3 w-3 mr-1" />
                                Run
                              </>
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenHistoricalDialog(screener)}
                            disabled={isRunning}
                          >
                            <History className="h-3 w-3 mr-1" />
                            Run Historical
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(screener)}
                          >
                            <Edit2 className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteClick(screener)}
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <ScreenerEditDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        name={editName}
        description={editDescription}
        onNameChange={setEditName}
        onDescriptionChange={setEditDescription}
        onSave={handleSave}
        isNew={!editingScreener}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Screener</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingScreener?.name}"? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={historicalDialogOpen}
        onOpenChange={handleHistoricalDialogChange}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Run Historical Screener</DialogTitle>
            <DialogDescription>
              {historicalScreener
                ? `Select a timestamp to run "${historicalScreener.name}" against historical data.`
                : "Select a timestamp to run the screener against historical data."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <DateTimePicker
              date={historicalTimestamp}
              onDateChange={setHistoricalTimestamp}
              placeholder="Pick date and time"
              className="w-full"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handleHistoricalDialogChange(false)}
              disabled={historicalRunning}
            >
              Cancel
            </Button>
            <Button
              onClick={handleHistoricalRun}
              disabled={
                historicalRunning || !historicalScreener || !historicalTimestamp
              }
            >
              {historicalRunning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <History className="h-4 w-4 mr-2" />
                  Run Historical
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
