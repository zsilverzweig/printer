"use client";

import { useEffect, useState } from "react";

import { Button } from "../../../lib/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../lib/components/ui/dialog";
import { Input } from "../../../lib/components/ui/input";
import { Label } from "../../../lib/components/ui/label";
import { Textarea } from "../../../lib/components/ui/textarea";
import type { ScreeningCriteria } from "../hooks/use-screeners";
import { ScreenerControls } from "./screener-controls";

interface ScreenerEditorProps {
  screener: ScreeningCriteria | null;
  open: boolean;
  onClose: () => void;
  onSave: (
    screener: {
      name: string;
      description?: string;
      criteria: ScreeningCriteria["criteria"];
    }
  ) => void;
  loading?: boolean;
}

export function ScreenerEditor({
  screener,
  open,
  onClose,
  onSave,
  loading = false,
}: ScreenerEditorProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [filters, setFilters] = useState<ScreeningCriteria["criteria"]>({
    limit: 200,
  });

  useEffect(() => {
    if (screener) {
      setName(screener.name);
      setDescription(screener.description || "");
      setFilters({
        ...screener.criteria,
        limit: screener.criteria.limit ?? 200,
      });
    } else {
      setName("");
      setDescription("");
      setFilters({ limit: 200 });
    }
  }, [screener, open]);

  const handleSave = () => {
    if (!name.trim()) {
      alert("Please enter a name for the screener");
      return;
    }

    onSave({
      name: name.trim(),
      description: description.trim() || undefined,
      criteria: filters,
    });

    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {screener ? "Edit Screener" : "Create New Screener"}
          </DialogTitle>
          <DialogDescription>
            {screener
              ? "Update the screener configuration and filters."
              : "Create a new screener with custom filters and criteria."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="screener-name">Name *</Label>
            <Input
              id="screener-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Momentum Breakouts"
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="screener-description">Description</Label>
            <Textarea
              id="screener-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description..."
              rows={2}
              disabled={loading}
            />
          </div>

          <ScreenerControls
            screener={screener ? { ...screener, name, description } : null}
            mode="live"
            filters={filters}
            onModeChange={() => undefined} // Not needed in editor
            onTimestampChange={() => undefined} // Not needed in editor
            onFilterChange={(updates) => setFilters({ ...filters, ...updates })}
            onRun={() => undefined} // Not needed in editor
            loading={loading}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading || !name.trim()}>
            {screener ? "Update Screener" : "Create Screener"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
