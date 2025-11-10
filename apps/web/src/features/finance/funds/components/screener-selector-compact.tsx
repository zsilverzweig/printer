/**
 * ScreenerSelectorCompact Component
 *
 * Compact screener selector that saves in real-time
 */

"use client";

import { Pencil, PlusCircle, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { type Fund, type ScreeningCriteria } from "@printer/shared";

import { fundService } from "../services/fund-service";
import { screeningCriteriaService } from "../services/screening-criteria-service";

import { ScreeningCriteriaForm } from "./screening-criteria-form";

import { Button } from "@/lib/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/lib/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/lib/components/ui/select";

interface ScreenerSelectorCompactProps {
  fundId: string;
  fund: Fund;
  onUpdate: () => void;
  onSavingChange?: (saving: boolean) => void;
}

export function ScreenerSelectorCompact({
  fundId,
  fund,
  onUpdate,
  onSavingChange,
}: ScreenerSelectorCompactProps) {
  const router = useRouter();
  const [screeningCriteriaId, setScreeningCriteriaId] =
    useState<string>("none");
  const [availableCriteria, setAvailableCriteria] = useState<
    ScreeningCriteria[]
  >([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCriteria, setEditingCriteria] =
    useState<ScreeningCriteria | null>(null);

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

  const handleSave = async (value: string) => {
    try {
      setIsSaving(true);
      onSavingChange?.(true);
      setError(null);

      await fundService.updateFund(fundId, {
        screeningCriteriaId: value === "none" ? undefined : value || undefined,
      });

      onUpdate();
    } catch (err) {
      console.error("Error saving screener link:", err);
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
      onSavingChange?.(false);
    }
  };

  const handleCreateNew = () => {
    setEditingCriteria(null);
    setIsDialogOpen(true);
  };

  const handleEdit = () => {
    const selectedCriteria = availableCriteria.find(
      (c) => c.id === screeningCriteriaId && screeningCriteriaId !== "none"
    );
    if (selectedCriteria) {
      // Navigate to screener page with this criteria selected
      router.push(`/screener?screener=${selectedCriteria.id}`);
    }
  };

  const handleDelete = async () => {
    const selectedCriteria = availableCriteria.find(
      (c) => c.id === screeningCriteriaId && screeningCriteriaId !== "none"
    );
    if (!selectedCriteria) return;

    if (
      !confirm(
        `Are you sure you want to delete "${selectedCriteria.name}"? This action cannot be undone.`
      )
    ) {
      return;
    }

    try {
      setError(null);
      await screeningCriteriaService.deleteScreeningCriteria(
        selectedCriteria.id
      );
      const criteria = await screeningCriteriaService.getScreeningCriteria();
      setAvailableCriteria(criteria);
      setScreeningCriteriaId("none");
      await handleSave("none");
    } catch (err) {
      console.error("Error deleting screening criteria:", err);
      setError(
        err instanceof Error ? err.message : "Failed to delete (may be in use)"
      );
    }
  };

  const handleCriteriaFormSave = async (data: {
    name: string;
    description?: string;
    criteria: any;
  }) => {
    try {
      // Only handle create mode (edit navigates to screener page)
      const created = await screeningCriteriaService.createScreeningCriteria(
        data
      );
      const criteria = await screeningCriteriaService.getScreeningCriteria();
      setAvailableCriteria(criteria);
      setScreeningCriteriaId(created.id);
      await handleSave(created.id);

      setIsDialogOpen(false);
      setEditingCriteria(null);
    } catch (err) {
      throw err;
    }
  };

  const selectedCriteria = availableCriteria.find(
    (c) => c.id === screeningCriteriaId && screeningCriteriaId !== "none"
  );

  return (
    <div className="space-y-2">
      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950/30 p-2 text-xs text-red-800 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="flex-1">
          <div className="flex gap-2">
            <Select
              value={screeningCriteriaId}
              onValueChange={(value) => {
                setScreeningCriteriaId(value);
                void handleSave(value);
              }}
              disabled={isSaving}
            >
              <SelectTrigger id="screeningCriteria" className="flex-1">
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
            {selectedCriteria && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleEdit}
                  className="h-9"
                  title="Edit criteria"
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDelete}
                  className="h-9"
                  title="Delete criteria"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleCreateNew}
              className="h-9"
              title="Create new criteria"
            >
              <PlusCircle className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>

      {selectedCriteria && (
        <div className="rounded-lg border bg-muted/30 p-2 text-xs space-y-1">
          <p className="font-medium">{selectedCriteria.name}</p>
          {selectedCriteria.description && (
            <p className="text-muted-foreground">
              {selectedCriteria.description}
            </p>
          )}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
            {selectedCriteria.criteria.min_price !== undefined && (
              <div>
                <span className="font-medium">Price:</span> $
                {selectedCriteria.criteria.min_price || 0} - $
                {selectedCriteria.criteria.max_price || 0}
              </div>
            )}
            {selectedCriteria.criteria.min_volume !== undefined && (
              <div>
                <span className="font-medium">Min Volume:</span>{" "}
                {selectedCriteria.criteria.min_volume.toLocaleString()}
              </div>
            )}
            {selectedCriteria.criteria.min_relative_volume !== undefined && (
              <div>
                <span className="font-medium">Min RV:</span>{" "}
                {selectedCriteria.criteria.min_relative_volume}x
              </div>
            )}
            {selectedCriteria.criteria.min_relative_volume_last_week !==
              undefined && (
              <div>
                <span className="font-medium">Min RV LW:</span>{" "}
                {selectedCriteria.criteria.min_relative_volume_last_week}x
              </div>
            )}
            {selectedCriteria.criteria.min_change_percent !== undefined && (
              <div>
                <span className="font-medium">Min Change:</span>{" "}
                {selectedCriteria.criteria.min_change_percent}%
              </div>
            )}
            {selectedCriteria.criteria.float_min !== undefined && (
              <div>
                <span className="font-medium">Float Min:</span>{" "}
                {selectedCriteria.criteria.float_min.toLocaleString()}M
              </div>
            )}
            {selectedCriteria.criteria.float_max !== undefined && (
              <div>
                <span className="font-medium">Float Max:</span>{" "}
                {selectedCriteria.criteria.float_max.toLocaleString()}M
              </div>
            )}
            {selectedCriteria.criteria.market_cap_min !== undefined && (
              <div>
                <span className="font-medium">Market Cap Min:</span> $
                {selectedCriteria.criteria.market_cap_min}M
              </div>
            )}
            {selectedCriteria.criteria.market_cap_max !== undefined && (
              <div>
                <span className="font-medium">Market Cap Max:</span> $
                {selectedCriteria.criteria.market_cap_max}M
              </div>
            )}
            {selectedCriteria.criteria.limit !== undefined && (
              <div>
                <span className="font-medium">Limit:</span>{" "}
                {selectedCriteria.criteria.limit}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dialog for creating criteria */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Screening Criteria</DialogTitle>
            <DialogDescription>
              Define filters for finding trading candidates
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
