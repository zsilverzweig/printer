/**
 * AlpacaAccountsCard Component
 *
 * Component for managing Alpaca account IDs (sim and real money).
 */

"use client";

import { Building2, Save } from "lucide-react";
import { useState } from "react";

import { Button } from "@/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import { Input } from "@/lib/components/ui/input";
import { Label } from "@/lib/components/ui/label";

export function AlpacaAccountsCard() {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [simAccountId, setSimAccountId] = useState("");
  const [realAccountId, setRealAccountId] = useState("");
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // TODO: Load existing account IDs from backend
  // useEffect(() => {
  //   loadAccountIds();
  // }, []);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setError(null);
      setSuccess(null);

      // TODO: Save to backend
      // await userService.updateAlpacaAccounts({
      //   simAccountId,
      //   realAccountId,
      // });

      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 500));

      setSuccess("Account IDs saved successfully");
      setIsEditing(false);

      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save account IDs"
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Alpaca Account IDs
        </CardTitle>
        <CardDescription>
          Link your Alpaca paper and live trading accounts. These are used by
          funds to execute trades based on their mode (Sim or Real).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 border border-red-200">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-md bg-green-50 p-3 text-sm text-green-800 border border-green-200">
            {success}
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="simAccountId">
              <span className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
                Simulation Account ID (Paper Trading)
              </span>
            </Label>
            <Input
              id="simAccountId"
              placeholder="Enter your Alpaca paper account ID"
              value={simAccountId}
              onChange={(e) => setSimAccountId(e.target.value)}
              disabled={!isEditing || isSaving}
            />
            <p className="text-xs text-muted-foreground">
              Used for simulation mode funds with virtual money
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="realAccountId">
              <span className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                Real Money Account ID (Live Trading)
              </span>
            </Label>
            <Input
              id="realAccountId"
              placeholder="Enter your Alpaca live account ID"
              value={realAccountId}
              onChange={(e) => setRealAccountId(e.target.value)}
              disabled={!isEditing || isSaving}
            />
            <p className="text-xs text-muted-foreground">
              Used for real money mode funds with actual trades
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          {isEditing ? (
            <>
              <Button
                variant="outline"
                onClick={() => setIsEditing(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                <Save className="h-4 w-4 mr-2" />
                {isSaving ? "Saving..." : "Save Account IDs"}
              </Button>
            </>
          ) : (
            <Button onClick={() => setIsEditing(true)}>Edit Account IDs</Button>
          )}
        </div>

        <div className="pt-4 border-t">
          <p className="text-sm text-muted-foreground">
            <strong>Note:</strong> You can find your account IDs in your Alpaca
            dashboard. The account ID determines which buying power and
            positions are used for fund operations.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
