/**
 * SetupEditor Component
 *
 * Dialog for creating or editing a trading setup.
 */

import { useEffect, useState } from "react";

import { Button } from "@/lib/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/lib/components/ui/dialog";
import { Input } from "@/lib/components/ui/input";
import { Label } from "@/lib/components/ui/label";
import { Textarea } from "@/lib/components/ui/textarea";

import { CreateSetupInput, Setup } from "../types";

interface SetupEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  setup?: Setup | null;
  onSave: (input: CreateSetupInput) => Promise<void>;
}

export function SetupEditor({
  open,
  onOpenChange,
  setup,
  onSave,
}: SetupEditorProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [criteriaJson, setCriteriaJson] = useState("{}");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (setup) {
      setName(setup.name);
      setDescription(setup.description || "");
      setCriteriaJson(JSON.stringify(setup.screeningCriteria, null, 2));
    } else {
      setName("");
      setDescription("");
      setCriteriaJson(
        JSON.stringify(
          {
            minPrice: 5,
            maxPrice: 100,
            minVolume: 1000000,
            relativeVolume: 2.0,
          },
          null,
          2
        )
      );
    }
  }, [setup, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError("Setup name is required");
      return;
    }

    let screeningCriteria;
    try {
      screeningCriteria = JSON.parse(criteriaJson);
    } catch {
      setError("Invalid JSON in screening criteria");
      return;
    }

    try {
      setIsSaving(true);
      setError(null);

      await onSave({
        name: name.trim(),
        description: description.trim() || undefined,
        screeningCriteria,
      });

      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save setup");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {setup ? "Edit Setup" : "Create New Setup"}
            </DialogTitle>
            <DialogDescription>
              Configure screening criteria for finding trading opportunities.
              The criteria will be used with the existing screener system.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 border border-red-200">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="setupName">Setup Name *</Label>
              <Input
                id="setupName"
                placeholder="e.g., High Volume Breakout"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isSaving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="setupDescription">Description</Label>
              <Textarea
                id="setupDescription"
                placeholder="Brief description of this setup"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isSaving}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="criteria">Screening Criteria (JSON) *</Label>
              <Textarea
                id="criteria"
                placeholder='{"minPrice": 5, "maxPrice": 100}'
                value={criteriaJson}
                onChange={(e) => setCriteriaJson(e.target.value)}
                disabled={isSaving}
                rows={10}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Common fields: minPrice, maxPrice, minVolume, relativeVolume,
                priceChangePercent, gapPercent, hasNews, market_cap_min,
                market_cap_max (in millions)
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : setup ? "Save Changes" : "Create Setup"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
