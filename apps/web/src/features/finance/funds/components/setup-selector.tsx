/**
 * SetupSelector Component
 *
 * Component for selecting or creating a trading setup.
 */

import { Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/lib/components/ui/select";

import { setupService } from "../services/setup-service";
import { Setup } from "../types";

interface SetupSelectorProps {
  selectedSetupId: string | null;
  onSelectSetup: (setupId: string | null) => void;
  onCreateNew: () => void;
}

export function SetupSelector({
  selectedSetupId,
  onSelectSetup,
  onCreateNew,
}: SetupSelectorProps) {
  const [setups, setSetups] = useState<Setup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSetups();
  }, []);

  const loadSetups = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await setupService.getSetups();
      setSetups(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load setups");
    } finally {
      setLoading(false);
    }
  };

  const selectedSetup = setups.find((s) => s.id === selectedSetupId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trading Setup</CardTitle>
        <CardDescription>
          Select an existing setup or create a new one
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 border border-red-200">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <Select
            value={selectedSetupId || ""}
            onValueChange={(value) => onSelectSetup(value || null)}
            disabled={loading}
          >
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Select a setup..." />
            </SelectTrigger>
            <SelectContent>
              {setups.map((setup) => (
                <SelectItem key={setup.id} value={setup.id}>
                  {setup.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="icon"
            onClick={onCreateNew}
            title="Create new setup"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {selectedSetup && (
          <div className="p-4 rounded-lg border bg-muted/50">
            <h4 className="font-medium mb-2">{selectedSetup.name}</h4>
            {selectedSetup.description && (
              <p className="text-sm text-muted-foreground mb-3">
                {selectedSetup.description}
              </p>
            )}
            <div className="text-sm">
              <p className="font-medium mb-1">Screening Criteria:</p>
              <pre className="text-xs bg-background p-2 rounded border overflow-auto">
                {JSON.stringify(selectedSetup.screeningCriteria, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {!selectedSetupId && !loading && (
          <div className="text-center py-6 text-muted-foreground">
            <p>No setup selected</p>
            <p className="text-sm mt-1">
              Select an existing setup or create a new one
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
