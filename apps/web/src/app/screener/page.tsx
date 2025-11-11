"use client";

import { useRouter, useSearchParams } from "next/navigation";
import React from "react";

import { ScreenerEditDialog } from "@/features/screener/components/screener-edit-dialog";
import { ScreenerHeader } from "@/features/screener/components/screener-header";
import { ScreenerIndex } from "@/features/screener/components/screener-index";
import { ScreenerTable } from "@/features/screener/components/screener-table";
import {
  useScreeners,
  type ScreeningCriteria,
} from "@/features/screener/hooks/use-screeners";
import type { StockData } from "@/features/screener/types";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/lib/components/ui/tabs";
import { toastError, toastSuccess } from "@/lib/utils/toast";
import { useScreenerData } from "@/lib/hooks/use-screener-data";
import { useUrlTabs } from "@/lib/hooks/use-url-tabs";

const API_BASE =
  process.env.NEXT_PUBLIC_WS_URL?.replace("ws://", "http://").replace(
    "wss://",
    "https://"
  ) || "http://localhost:8000";

export default function ScreenerPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useUrlTabs({ defaultTab: "screener" });
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
  const [currentFilters, setCurrentFilters] =
    React.useState<ScreeningCriteria["criteria"]>({
      limit: 200,
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

  const selectedScreener = React.useMemo(() => {
    if (!selectedScreenerId || selectedScreenerId === "new") {
      return null;
    }
    return screeners.find((s) => s.id === selectedScreenerId) || null;
  }, [screeners, selectedScreenerId]);

  // Clear selection if selected screener was deleted
  React.useEffect(() => {
    if (
      selectedScreenerId &&
      selectedScreenerId !== "new" &&
      !selectedScreener
    ) {
      // Screener was deleted, clear selection
      setSelectedScreenerId("");
      try {
        const params = new URLSearchParams(Array.from(searchParams.entries()));
        params.delete("screener");
        const query = params.toString();
        router.replace(query ? `?${query}` : "?", { scroll: false });
      } catch (e) {
        // no-op on URL errors
      }
    }
  }, [selectedScreenerId, selectedScreener, searchParams, router]);

  const isNewScreener = selectedScreenerId === "new";

  // Initialize selected screener from URL and keep URL in sync
  React.useEffect(() => {
    const urlScreener = searchParams.get("screener") || "";
    if (urlScreener !== selectedScreenerId) {
      setSelectedScreenerId(urlScreener);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

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
        limit: selectedScreener.criteria.limit ?? 200,
      };
      setCurrentFilters(filters);
      setSavedFilters(filters);
      setEditedName(selectedScreener.name);
      setEditedDescription(selectedScreener.description || "");
      setIsEditMode(false);
    } else if (isNewScreener) {
      const defaultFilters = { limit: 200 };
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

  // Removed debounce-driven auto-run. Runs are triggered onBlur/change from controls.

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

    // Update URL query to reflect selected screener (preserve other params)
    try {
      const params = new URLSearchParams(Array.from(searchParams.entries()));
      if (value) {
        params.set("screener", value);
      } else {
        params.delete("screener");
      }
      const query = params.toString();
      router.replace(query ? `?${query}` : "?", { scroll: false });
    } catch (e) {
      // no-op on URL errors
    }
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
      // Clear selection and URL
      setSelectedScreenerId("");
      try {
        const params = new URLSearchParams(Array.from(searchParams.entries()));
        params.delete("screener");
        const query = params.toString();
        router.replace(query ? `?${query}` : "?", { scroll: false });
      } catch (e) {
        // no-op on URL errors
      }
    }
  };

  // Handle run
  const handleRun = async () => {
    setRunningScreener(true);
    try {
      const filtersWithLimit = {
        ...currentFilters,
        limit: currentFilters.limit ?? 200,
      };

      if (mode === "historical") {
        if (!historicalTimestamp) {
          return;
        }

        // For historical mode, use inline criteria (no save needed)
        const result = await runScreenerWithCriteria(
          filtersWithLimit,
          historicalTimestamp
        );
        if (result?.results) {
          setHistoricalResults(result.results);
        } else {
          setHistoricalResults([]);
        }
      } else {
        // Live mode: use inline criteria (no save needed)
        const result = await runScreenerWithCriteria(filtersWithLimit);
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

  // Ensure results update shortly after screener selection
  React.useEffect(() => {
    if (!selectedScreenerId) return;
    if (mode !== "live") return;
    const hasFilters = currentFilters && Object.keys(currentFilters).length > 0;
    if (!hasFilters) return;
    const t = setTimeout(() => {
      // fire a run to reflect the newly selected screener
      void handleRun();
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedScreenerId, mode, JSON.stringify(currentFilters)]);

  // Handle save filters
  const handleSaveFilters = async () => {
    if (!selectedScreener) return;

    const filtersWithLimit = {
      ...currentFilters,
      limit: currentFilters.limit ?? 200,
    };

    const screenerData = {
      ...selectedScreener,
      criteria: filtersWithLimit,
    };
    const saved = await saveScreener(screenerData as any);
    if (saved) {
      setSavedFilters(filtersWithLimit);
    }
  };

  const handleCopyHistoricalLink = React.useCallback(async () => {
    if (mode !== "historical") {
      toastError("Copy link available in historical mode only");
      return;
    }

    if (!historicalTimestamp) {
      toastError("Select a timestamp first", {
        description: "Pick a historical timestamp to generate the link.",
      });
      return;
    }

    try {
      const filtersWithLimit = {
        ...currentFilters,
        limit: currentFilters.limit ?? 200,
      };

      const url = new URL(`${API_BASE}/api/screening-criteria/run`);
      url.searchParams.set("timestamp", historicalTimestamp.toISOString());

      const payload = JSON.stringify(filtersWithLimit);
      const escapedPayload = payload.replace(/'/g, "'\\''");

      const curlCommand = `curl -X POST "${url.toString()}" -H "Content-Type: application/json" -d '${escapedPayload}'`;

      await navigator.clipboard.writeText(curlCommand);
      toastSuccess("Historical screener link copied", {
        description: "Paste into a terminal and run curl to reproduce results.",
      });
    } catch (error) {
      const description =
        error instanceof Error ? error.message : "Unknown clipboard error";
      toastError("Failed to copy link", { description });
    }
  }, [mode, historicalTimestamp, currentFilters]);

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Screener</h1>
        <p className="text-muted-foreground">
          Screen stocks based on custom criteria and filters
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="screener">Screener</TabsTrigger>
          <TabsTrigger value="index">Index</TabsTrigger>
        </TabsList>

        <TabsContent value="screener" className="space-y-4 mt-6">
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
            onCopyHistoricalLink={handleCopyHistoricalLink}
            canCopyHistoricalLink={mode === "historical" && !!historicalTimestamp}
          />

          <ScreenerTable
            data={displayData}
            mode={mode}
            isConnected={isConnected}
            historicalTimestamp={historicalTimestamp}
            runningScreener={runningScreener}
            selectedScreener={!!selectedScreener || isNewScreener}
            isNewScreener={isNewScreener}
          />
        </TabsContent>

        <TabsContent value="index" className="space-y-4 mt-6">
          <ScreenerIndex
            screeners={screeners}
            loading={screenersLoading}
            onScreenerSelect={(screenerId) => {
              handleScreenerSelect(screenerId);
              setActiveTab("screener");
            }}
          />
        </TabsContent>
      </Tabs>

      <ScreenerEditDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        name={tempName}
        description={tempDescription}
        onNameChange={setTempName}
        onDescriptionChange={setTempDescription}
        onSave={handleSaveFromDialog}
      />
    </div>
  );
}
