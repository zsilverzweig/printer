"use client";

import React from "react";

import { ScreenerEditDialog } from "@/features/screener/components/screener-edit-dialog";
import { ScreenerHeader } from "@/features/screener/components/screener-header";
import { ScreenerTable } from "@/features/screener/components/screener-table";
import {
  useScreeners,
  type ScreeningCriteria,
} from "@/features/screener/hooks/use-screeners";
import type { StockData } from "@/features/screener/types";
import { useScreenerData } from "@/lib/hooks/use-screener-data";

export default function ScreenerPage() {
  const {
    screeners,
    loading: screenersLoading,
    runScreener,
    runScreenerWithCriteria,
    saveScreener,
    deleteScreener,
  } = useScreeners();
  const { data: liveData, isConnected } = useScreenerData();

  // Core state
  const [selectedScreenerId, setSelectedScreenerId] =
    React.useState<string>("");
  const [isEditMode, setIsEditMode] = React.useState(false);
  const [editedName, setEditedName] = React.useState("");
  const [editedDescription, setEditedDescription] = React.useState("");
  const [currentFilters, setCurrentFilters] = React.useState<
    ScreeningCriteria["criteria"]
  >({
    limit: 200,
    exclude_etfs: true,
  });
  const [mode, setMode] = React.useState<"live" | "historical">("live");
  const [historicalTimestamp, setHistoricalTimestamp] = React.useState<
    Date | undefined
  >(undefined);
  const [historicalResults, setHistoricalResults] = React.useState<
    any[] | null
  >(null);
  const [liveFilteredResults, setLiveFilteredResults] = React.useState<
    any[] | null
  >(null);
  const [runningScreener, setRunningScreener] = React.useState(false);
  const [editDialogOpen, setEditDialogOpen] = React.useState(false);
  const [tempName, setTempName] = React.useState("");
  const [tempDescription, setTempDescription] = React.useState("");
  const [savedFilters, setSavedFilters] = React.useState<
    ScreeningCriteria["criteria"] | null
  >(null);

  const selectedScreener = React.useMemo(
    () => screeners.find((s) => s.id === selectedScreenerId) || null,
    [screeners, selectedScreenerId]
  );

  const isNewScreener = selectedScreenerId === "new";

  // Check if filters have been modified
  const filtersModified = React.useMemo(() => {
    if (!selectedScreener || isEditMode) return false;
    if (!savedFilters) return false;
    return JSON.stringify(currentFilters) !== JSON.stringify(savedFilters);
  }, [currentFilters, savedFilters, selectedScreener, isEditMode]);

  // Load screener data when selected
  React.useEffect(() => {
    if (selectedScreener) {
      const filters = {
        ...selectedScreener.criteria,
        exclude_etfs: selectedScreener.criteria.exclude_etfs !== false,
      };
      setCurrentFilters(filters);
      setSavedFilters(filters);
      setEditedName(selectedScreener.name);
      setEditedDescription(selectedScreener.description || "");
      setIsEditMode(false);
    } else if (isNewScreener) {
      const defaultFilters = { limit: 200, exclude_etfs: true };
      setCurrentFilters(defaultFilters);
      setSavedFilters(null);
      setEditedName("");
      setEditedDescription("");
      setIsEditMode(true);
    }
  }, [selectedScreener, isNewScreener]);

  // Track if we're loading a screener to avoid immediate auto-run
  const isLoadingScreenerRef = React.useRef(false);

  React.useEffect(() => {
    isLoadingScreenerRef.current = true;
    const timer = setTimeout(() => {
      isLoadingScreenerRef.current = false;
    }, 1000);
    return () => clearTimeout(timer);
  }, [selectedScreenerId]);

  // Auto-apply filters when they change (debounced)
  React.useEffect(() => {
    // Don't auto-run if:
    // - Currently running a screener
    // - In historical mode (requires timestamp)
    // - Just loaded a screener (avoid immediate run)
    if (
      runningScreener ||
      mode === "historical" ||
      isLoadingScreenerRef.current
    ) {
      return;
    }

    // Debounce the auto-run
    const timeoutId = setTimeout(async () => {
      // Skip if we just loaded a screener (avoid immediate run)
      if (isLoadingScreenerRef.current) {
        return;
      }

      const hasFilters =
        currentFilters && Object.keys(currentFilters).length > 0;
      if (!hasFilters) {
        return;
      }

      setRunningScreener(true);
      try {
        // Use inline criteria API - no database save needed
        const result = await runScreenerWithCriteria(currentFilters);
        if (result?.results) {
          setLiveFilteredResults(result.results);
        } else {
          setLiveFilteredResults([]);
        }
      } catch (err) {
        // Silently handle errors for auto-runs
        console.error("Auto-run screener error:", err);
      } finally {
        setRunningScreener(false);
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timeoutId);
  }, [currentFilters, mode, runScreenerWithCriteria]);

  // Compute display data
  const displayData: StockData[] = React.useMemo(() => {
    if (mode === "historical") {
      return historicalResults || [];
    } else {
      // In live mode, prefer server-filtered results if available
      // Otherwise fall back to unfiltered WebSocket data
      return liveFilteredResults || liveData || [];
    }
  }, [mode, liveData, historicalResults, liveFilteredResults]);

  // Handle screener selection
  const handleScreenerSelect = (value: string) => {
    setSelectedScreenerId(value);
    setHistoricalResults(null);
    setLiveFilteredResults(null); // Clear filtered results when switching screeners
    setMode("live");
  };

  // Handle save (for new screeners or dialog)
  const handleSave = async () => {
    if (!editedName.trim()) {
      return;
    }

    const screenerData = {
      ...(selectedScreener && !isNewScreener ? selectedScreener : {}),
      name: editedName,
      description: editedDescription,
      criteria: currentFilters,
    };

    const saved = await saveScreener(screenerData as any);
    if (saved) {
      setSelectedScreenerId(saved.id);
      setIsEditMode(false);
      setEditDialogOpen(false);
    }
  };

  // Handle save from dialog
  const handleSaveFromDialog = async () => {
    if (!tempName.trim()) {
      return;
    }

    const screenerData = {
      ...(selectedScreener && !isNewScreener ? selectedScreener : {}),
      name: tempName,
      description: tempDescription,
      criteria: currentFilters,
    };

    const saved = await saveScreener(screenerData as any);
    if (saved) {
      setSelectedScreenerId(saved.id);
      setIsEditMode(false);
      setEditDialogOpen(false);
    }
  };

  // Open edit dialog
  const handleOpenEditDialog = () => {
    if (selectedScreener) {
      setTempName(selectedScreener.name);
      setTempDescription(selectedScreener.description || "");
      setEditDialogOpen(true);
    }
  };

  // Handle cancel
  const handleCancel = () => {
    if (isNewScreener) {
      setSelectedScreenerId("");
    } else {
      setIsEditMode(false);
      if (selectedScreener && savedFilters) {
        setEditedName(selectedScreener.name);
        setEditedDescription(selectedScreener.description || "");
        setCurrentFilters(savedFilters);
      }
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!selectedScreener) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete "${selectedScreener.name}"?`
    );
    if (!confirmed) return;

    const success = await deleteScreener(selectedScreener.id);
    if (success) {
      setSelectedScreenerId("");
    }
  };

  // Handle run
  const handleRun = async () => {
    setRunningScreener(true);
    try {
      if (mode === "historical") {
        if (!historicalTimestamp) {
          return;
        }

        // For historical mode, use inline criteria (no save needed)
        const result = await runScreenerWithCriteria(
          currentFilters,
          historicalTimestamp
        );
        if (result?.results) {
          setHistoricalResults(result.results);
        } else {
          setHistoricalResults([]);
        }
      } else {
        // Live mode: use inline criteria (no save needed)
        const result = await runScreenerWithCriteria(currentFilters);
        if (result?.results) {
          setLiveFilteredResults(result.results);
        } else {
          setLiveFilteredResults([]);
        }
      }
    } catch (err) {
      // Error handling is done in the hook
    } finally {
      setRunningScreener(false);
    }
  };

  // Handle save filters
  const handleSaveFilters = async () => {
    if (!selectedScreener) return;

    const screenerData = {
      ...selectedScreener,
      criteria: currentFilters,
    };
    const saved = await saveScreener(screenerData as any);
    if (saved) {
      setSavedFilters(currentFilters);
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <ScreenerHeader
        screeners={screeners}
        screenersLoading={screenersLoading}
        selectedScreenerId={selectedScreenerId}
        selectedScreener={selectedScreener}
        isNewScreener={isNewScreener}
        isEditMode={isEditMode}
        editedName={editedName}
        setEditedName={setEditedName}
        editedDescription={editedDescription}
        setEditedDescription={setEditedDescription}
        currentFilters={currentFilters}
        mode={mode}
        historicalTimestamp={historicalTimestamp}
        filtersModified={filtersModified}
        savedFilters={savedFilters}
        isConnected={isConnected}
        runningScreener={runningScreener}
        onScreenerSelect={handleScreenerSelect}
        onSave={handleSave}
        onCancel={handleCancel}
        onOpenEditDialog={handleOpenEditDialog}
        onSaveFilters={handleSaveFilters}
        onDelete={handleDelete}
        onModeChange={(newMode) => {
          setMode(newMode);
          if (newMode === "live") {
            // Clear historical results when switching to live
            setHistoricalResults(null);
          } else {
            // Clear live filtered results when switching to historical
            setLiveFilteredResults(null);
          }
        }}
        onTimestampChange={setHistoricalTimestamp}
        onFilterChange={(updates) => {
          setCurrentFilters({ ...currentFilters, ...updates });
        }}
        onRun={handleRun}
      />

      <ScreenerEditDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        name={tempName}
        description={tempDescription}
        onNameChange={setTempName}
        onDescriptionChange={setTempDescription}
        onSave={handleSaveFromDialog}
      />

      {/* Results Table */}
      <div className="flex-1 overflow-auto">
        <div className="container mx-auto p-4">
          <ScreenerTable
            data={displayData}
            mode={mode}
            isConnected={isConnected}
            historicalTimestamp={historicalTimestamp}
            runningScreener={runningScreener}
            selectedScreener={!!selectedScreener || isNewScreener}
            isNewScreener={isNewScreener}
          />
        </div>
      </div>
    </div>
  );
}
