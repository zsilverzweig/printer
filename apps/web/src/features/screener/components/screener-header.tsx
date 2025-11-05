"use client";

import { Edit2, Save, Trash2, X } from "lucide-react";

import { Button } from "@/lib/components/ui/button";
import { Input } from "@/lib/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/lib/components/ui/select";

import type { ScreeningCriteria } from "../hooks/use-screeners";
import { ScreenerControls } from "./screener-controls";

interface ScreenerHeaderProps {
  screeners: ScreeningCriteria[];
  screenersLoading: boolean;
  selectedScreenerId: string;
  selectedScreener: ScreeningCriteria | null;
  isNewScreener: boolean;
  isEditMode: boolean;
  editedName: string;
  setEditedName: (name: string) => void;
  editedDescription: string;
  setEditedDescription: (desc: string) => void;
  currentFilters: ScreeningCriteria["criteria"];
  mode: "live" | "historical";
  historicalTimestamp: Date | undefined;
  filtersModified: boolean;
  savedFilters: ScreeningCriteria["criteria"] | null;
  isConnected: boolean;
  runningScreener: boolean;
  onScreenerSelect: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onOpenEditDialog: () => void;
  onSaveFilters: () => void;
  onDelete: () => void;
  onModeChange: (mode: "live" | "historical") => void;
  onTimestampChange: (date: Date | undefined) => void;
  onFilterChange: (updates: Partial<ScreeningCriteria["criteria"]>) => void;
  onRun: () => void;
}

export function ScreenerHeader({
  screeners,
  screenersLoading,
  selectedScreenerId,
  selectedScreener,
  isNewScreener,
  isEditMode,
  editedName,
  setEditedName,
  editedDescription,
  setEditedDescription,
  currentFilters,
  mode,
  historicalTimestamp,
  filtersModified,
  savedFilters,
  isConnected,
  runningScreener,
  onScreenerSelect,
  onSave,
  onCancel,
  onOpenEditDialog,
  onSaveFilters,
  onDelete,
  onModeChange,
  onTimestampChange,
  onFilterChange,
  onRun,
}: ScreenerHeaderProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        {/* Screener Selector */}
        <Select
          value={selectedScreenerId || undefined}
          onValueChange={onScreenerSelect}
        >
          <SelectTrigger className="w-64 h-8 text-sm">
            <SelectValue placeholder="Select or create screener..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="new" className="text-blue-600 font-medium">
              + Create New Screener
            </SelectItem>
            {screeners.length > 0 && <div className="border-t my-1" />}
            {screeners.map((screener) => (
              <SelectItem key={screener.id} value={screener.id}>
                {screener.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Edit Mode UI */}
        {(selectedScreener || isNewScreener) && (
          <>
            {isEditMode ? (
              <>
                <Input
                  placeholder="Screener name..."
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  className="w-48 h-8 text-sm"
                />
                <Button
                  variant="default"
                  size="sm"
                  onClick={onSave}
                  className="h-8"
                  disabled={!editedName.trim()}
                >
                  <Save className="h-3 w-3 mr-1" />
                  Save
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onCancel}
                  className="h-8"
                >
                  <X className="h-3 w-3 mr-1" />
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <span className="text-sm font-medium">
                  {selectedScreener?.name}
                </span>
                {filtersModified && (
                  <span className="text-xs text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 dark:text-yellow-400 px-2 py-1 rounded border border-yellow-200 dark:border-yellow-800">
                    Filters modified
                  </span>
                )}
                {!isNewScreener && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onOpenEditDialog}
                      className="h-8 w-8 p-0"
                      title="Edit screener name"
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    {filtersModified && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={onSaveFilters}
                        className="h-8"
                      >
                        <Save className="h-3 w-3 mr-1" />
                        Save Filters
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onDelete}
                      className="h-8"
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Delete
                    </Button>
                  </>
                )}
              </>
            )}
          </>
        )}

        {/* Live indicator */}
        {mode === "live" && !isNewScreener && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground ml-auto">
            <div
              className={`h-2 w-2 rounded-full ${
                isConnected ? "bg-green-500 animate-pulse" : "bg-red-500"
              }`}
            />
            <span>{isConnected ? "Live Data" : "Disconnected"}</span>
          </div>
        )}
      </div>

      {/* Filters Row */}
      <div className="space-y-2">
        {!isEditMode && selectedScreener && (
          <div className="text-xs text-muted-foreground">
            {filtersModified ? (
              <span className="text-yellow-600 dark:text-yellow-400">
                ⚠️ Filters are temporarily overridden. Changes apply to
                screening but won't save unless you click "Save Filters".
              </span>
            ) : (
              <span>
                Using saved filters from "{selectedScreener.name}". Adjust below
                to override temporarily.
              </span>
            )}
          </div>
        )}
        {!selectedScreener && !isNewScreener && (
          <div className="text-xs text-muted-foreground">
            <span>
              No screener selected. Adjust filters below and click "Run" to see
              filtered results.
            </span>
          </div>
        )}
        <ScreenerControls
          screener={selectedScreener}
          mode={mode}
          filters={currentFilters}
          timestamp={historicalTimestamp}
          onModeChange={onModeChange}
          onTimestampChange={onTimestampChange}
          onFilterChange={onFilterChange}
          onRun={onRun}
          loading={runningScreener}
        />
      </div>
    </div>
  );
}
