"use client";

import { Edit2, Loader2, Play, Plus, Trash2 } from "lucide-react";
import React from "react";

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/lib/components/ui/table";

import type { ScreeningCriteria } from "../hooks/use-screeners";
import { useScreeners } from "../hooks/use-screeners";
import { ScreenerEditDialog } from "./screener-edit-dialog";

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
  const [screenerCounts, setScreenerCounts] = React.useState<
    Record<string, number | null>
  >({});
  const [editDialogOpen, setEditDialogOpen] = React.useState(false);
  const [editingScreener, setEditingScreener] =
    React.useState<ScreeningCriteria | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [deletingScreener, setDeletingScreener] =
    React.useState<ScreeningCriteria | null>(null);
  const [editName, setEditName] = React.useState("");
  const [editDescription, setEditDescription] = React.useState("");

  const handleRunScreener = async (screener: ScreeningCriteria) => {
    setRunningScreenerIds((prev) => new Set(prev).add(screener.id));
    try {
      const result = await runScreenerWithCriteria(screener.criteria);
      setScreenerCounts((prev) => ({
        ...prev,
        [screener.id]: result?.ticker_count ?? null,
      }));
    } catch (error) {
      console.error("Error running screener:", error);
      setScreenerCounts((prev) => ({
        ...prev,
        [screener.id]: null,
      }));
    } finally {
      setRunningScreenerIds((prev) => {
        const next = new Set(prev);
        next.delete(screener.id);
        return next;
      });
    }
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
      criteria: editingScreener?.criteria || {
        limit: 200,
        exclude_etfs: true,
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
          <div className="flex items-center gap-2">
            <Button onClick={handleCreate} variant="default">
              <Plus className="h-4 w-4 mr-2" />
              Create Screener
            </Button>
            <Button
              onClick={handleRunAll}
              disabled={screeners.length === 0 || runningScreenerIds.size > 0}
              variant="outline"
            >
              <Play className="h-4 w-4 mr-2" />
              Run All
            </Button>
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
                  const count = screenerCounts[screener.id];
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
                          <span className="font-semibold">{count}</span>
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
    </>
  );
}
