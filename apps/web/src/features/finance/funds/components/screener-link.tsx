/**
 * ScreenerLink Component
 *
 * Component for linking the fund to screening criteria
 */

"use client";

import { Pencil, PlusCircle, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import {
  type Fund,
  type ScreeningCriteria,
  type ScreeningCriteriaParams,
} from "@printer/shared";

import { fundService } from "../services/fund-service";
import { screeningCriteriaService } from "../services/screening-criteria-service";

import { ScreeningCriteriaForm } from "./screening-criteria-form";

import { Button } from "@/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/lib/components/ui/dialog";
import { Label } from "@/lib/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/lib/components/ui/select";

interface ScreenerLinkProps {
  fundId: string;
  fund: Fund;
  onUpdate: () => void;
}

export function ScreenerLink({ fundId, fund, onUpdate }: ScreenerLinkProps) {
  const [screeningCriteriaId, setScreeningCriteriaId] =
    useState<string>("none");
  const [availableCriteria, setAvailableCriteria] = useState<
    ScreeningCriteria[]
  >([]);
  const [selectedCriteria, setSelectedCriteria] =
    useState<ScreeningCriteria | null>(null);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [editingCriteria, setEditingCriteria] =
    useState<ScreeningCriteria | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Fetch available screening criteria on mount
  useEffect(() => {
    const fetchCriteria = async () => {
      try {
        const criteria = await screeningCriteriaService.getScreeningCriteria();
        setAvailableCriteria(criteria);
      } catch (err) {
        console.error("Error fetching screening criteria:", err);
        setError("Failed to load screening criteria");
      }
    };

    fetchCriteria();
  }, []);

  // Set initial value from fund
  useEffect(() => {
    if (fund?.screeningCriteriaId) {
      setScreeningCriteriaId(fund.screeningCriteriaId);
    } else {
      setScreeningCriteriaId("none");
    }
  }, [fund]);

  // Load full criteria details when selection changes
  useEffect(() => {
    if (screeningCriteriaId && screeningCriteriaId !== "none") {
      const criteria = availableCriteria.find(
        (c) => c.id === screeningCriteriaId
      );
      setSelectedCriteria(criteria || null);
    } else {
      setSelectedCriteria(null);
    }
  }, [screeningCriteriaId, availableCriteria]);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setError(null);
      setSuccess(false);

      await fundService.updateFund(fundId, {
        screeningCriteriaId:
          screeningCriteriaId === "none"
            ? undefined
            : screeningCriteriaId || undefined,
      });

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      onUpdate();
    } catch (err) {
      console.error("Error saving screener link:", err);
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = () => {
    setScreeningCriteriaId("none");
  };

  const handleCreateNew = () => {
    setDialogMode("create");
    setEditingCriteria(null);
    setIsDialogOpen(true);
  };

  const handleEdit = () => {
    if (selectedCriteria) {
      setDialogMode("edit");
      setEditingCriteria(selectedCriteria);
      setIsDialogOpen(true);
    }
  };

  const handleDelete = async () => {
    if (!selectedCriteria) return;

    if (
      !confirm(
        `Are you sure you want to delete "${selectedCriteria.name}"? This action cannot be undone.`
      )
    ) {
      return;
    }

    try {
      setIsDeleting(true);
      setError(null);

      await screeningCriteriaService.deleteScreeningCriteria(
        selectedCriteria.id
      );

      // Refresh criteria list
      const criteria = await screeningCriteriaService.getScreeningCriteria();
      setAvailableCriteria(criteria);

      // Clear selection if we deleted the selected one
      setScreeningCriteriaId("none");
      setSelectedCriteria(null);
    } catch (err) {
      console.error("Error deleting screening criteria:", err);
      setError(
        err instanceof Error ? err.message : "Failed to delete (may be in use)"
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCriteriaFormSave = async (data: {
    name: string;
    description?: string;
    criteria: ScreeningCriteriaParams;
  }) => {
    try {
      if (dialogMode === "create") {
        const created = await screeningCriteriaService.createScreeningCriteria(
          data
        );
        // Refresh list
        const criteria = await screeningCriteriaService.getScreeningCriteria();
        setAvailableCriteria(criteria);
        // Auto-select the newly created criteria
        setScreeningCriteriaId(created.id);
      } else if (dialogMode === "edit" && editingCriteria) {
        await screeningCriteriaService.updateScreeningCriteria(
          editingCriteria.id,
          data
        );
        // Refresh list
        const criteria = await screeningCriteriaService.getScreeningCriteria();
        setAvailableCriteria(criteria);
      }

      setIsDialogOpen(false);
      setEditingCriteria(null);
    } catch (err) {
      throw err; // Let the form handle the error
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-800 dark:text-red-200">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg bg-green-50 dark:bg-green-950/30 p-4 text-sm text-green-800 dark:text-green-200">
          Screener configuration saved successfully!
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Screening Criteria</CardTitle>
          <CardDescription>
            Select screening criteria to filter tradeable stocks for this fund
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="screeningCriteria">Screening Configuration</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCreateNew}
                className="h-7"
              >
                <PlusCircle className="h-4 w-4 mr-1" />
                Create New
              </Button>
            </div>
            <Select
              value={screeningCriteriaId}
              onValueChange={setScreeningCriteriaId}
              disabled={isSaving}
            >
              <SelectTrigger id="screeningCriteria">
                <SelectValue placeholder="Select screening criteria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None - Use global defaults</SelectItem>
                {availableCriteria.map((criteria) => (
                  <SelectItem key={criteria.id} value={criteria.id}>
                    {criteria.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Choose a screening configuration to filter stocks by price,
              volume, market cap, and other criteria
            </p>
          </div>

          {selectedCriteria && (
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium">{selectedCriteria.name}</p>
                  {selectedCriteria.description && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {selectedCriteria.description}
                    </p>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleEdit}
                    className="h-7"
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="h-7"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                {/* Database Filters */}
                {(selectedCriteria.criteria.asset_types ||
                  selectedCriteria.criteria.market_cap_min ||
                  selectedCriteria.criteria.market_cap_max) && (
                  <div className="text-xs">
                    <p className="font-medium text-muted-foreground mb-1">
                      Database Filters:
                    </p>
                    <div className="space-y-0.5 pl-2">
                      {selectedCriteria.criteria.asset_types && (
                        <p>
                          • Asset Types:{" "}
                          {selectedCriteria.criteria.asset_types.join(", ")}
                        </p>
                      )}
                      {(selectedCriteria.criteria.market_cap_min ||
                        selectedCriteria.criteria.market_cap_max) && (
                        <p>
                          • Market Cap: $
                          {(
                            (selectedCriteria.criteria.market_cap_min || 0) /
                            1000000
                          ).toLocaleString()}
                          M -{" "}
                          {selectedCriteria.criteria.market_cap_max
                            ? `$${(
                                (selectedCriteria.criteria.market_cap_max ||
                                  0) / 1000000
                              ).toLocaleString()}M`
                            : "∞"}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Real-time Filters */}
                <div className="text-xs">
                  <p className="font-medium text-muted-foreground mb-1">
                    Real-time Filters:
                  </p>
                  <div className="space-y-0.5 pl-2">
                    <p>
                      • Price: ${selectedCriteria.criteria.min_price || 0} - $
                      {selectedCriteria.criteria.max_price || 0}
                    </p>
                    <p>
                      • Min Volume:{" "}
                      {(
                        selectedCriteria.criteria.min_volume || 0
                      ).toLocaleString()}
                    </p>
                    <p>
                      • Min Change:{" "}
                      {selectedCriteria.criteria.min_change_percent || 0}%
                    </p>
                    <p>
                      • Order By: {selectedCriteria.criteria.order_by || "rv14"}
                    </p>
                    <p>• Limit: {selectedCriteria.criteria.limit || 200}</p>
                  </div>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleClear}
                className="w-full"
              >
                Clear Selection
              </Button>
            </div>
          )}

          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-4">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              💡 <strong>Tip:</strong> Screening criteria control which stocks
              are eligible for trading. Database filters narrow down the
              universe, while real-time filters focus on price action and
              momentum.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save Screener Link"}
        </Button>
      </div>

      {/* Dialog for creating/editing criteria */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === "create"
                ? "Create Screening Criteria"
                : "Edit Screening Criteria"}
            </DialogTitle>
            <DialogDescription>
              {dialogMode === "create"
                ? "Define filters for finding trading candidates"
                : "Update screening criteria configuration"}
            </DialogDescription>
          </DialogHeader>
          <ScreeningCriteriaForm
            criteria={editingCriteria || undefined}
            onSave={handleCriteriaFormSave}
            onCancel={() => {
              setIsDialogOpen(false);
              setEditingCriteria(null);
            }}
            isSaving={isSaving}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
