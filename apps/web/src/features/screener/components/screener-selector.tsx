"use client";

import { Button } from "@/lib/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/lib/components/ui/select";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { ScreeningCriteria } from "../hooks/use-screeners";

interface ScreenerSelectorProps {
  screeners: ScreeningCriteria[];
  selectedScreener: ScreeningCriteria | null;
  onSelect: (screener: ScreeningCriteria | null) => void;
  onEdit: (screener: ScreeningCriteria) => void;
  onDelete: (screenerId: string) => void;
  onNew: () => void;
  loading?: boolean;
}

export function ScreenerSelector({
  screeners,
  selectedScreener,
  onSelect,
  onEdit,
  onDelete,
  onNew,
  loading = false,
}: ScreenerSelectorProps) {
  const handleDelete = (screener: ScreeningCriteria) => {
    if (confirm(`Delete screener "${screener.name}"?`)) {
      onDelete(screener.id);
      if (selectedScreener?.id === screener.id) {
        onSelect(null);
      }
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Select
        value={selectedScreener?.id || ""}
        onValueChange={(value) => {
          const screener = screeners.find((s) => s.id === value) || null;
          onSelect(screener);
        }}
        disabled={loading}
      >
        <SelectTrigger className="w-[300px]">
          <SelectValue placeholder="Select a screener..." />
        </SelectTrigger>
        <SelectContent>
          {screeners.length === 0 ? (
            <SelectItem value="__empty__" disabled>
              No screeners found
            </SelectItem>
          ) : (
            screeners.map((screener) => (
              <SelectItem key={screener.id} value={screener.id}>
                {screener.name}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>

      {selectedScreener && (
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEdit(selectedScreener)}
            disabled={loading}
          >
            <Pencil className="h-4 w-4 mr-1" />
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleDelete(selectedScreener)}
            disabled={loading}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete
          </Button>
        </>
      )}

      <Button variant="default" size="sm" onClick={onNew} disabled={loading}>
        <Plus className="h-4 w-4 mr-1" />
        New
      </Button>
    </div>
  );
}
