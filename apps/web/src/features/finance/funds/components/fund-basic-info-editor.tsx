/**
 * FundBasicInfoEditor Component
 *
 * Allows editing fund name, description, icon, and color.
 */

"use client";

import { Fund, UpdateFundInput } from "@shared/types";
import { Check } from "lucide-react";
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
import { Textarea } from "@/lib/components/ui/textarea";

import { getColorClasses, getIconByName } from "../config/icon-options";
import { fundService } from "../services/fund-service";
import { IconColorPicker } from "./icon-color-picker";

interface FundBasicInfoEditorProps {
  fund: Fund;
  onUpdate: () => void;
}

export function FundBasicInfoEditor({
  fund,
  onUpdate,
}: FundBasicInfoEditorProps) {
  const [name, setName] = useState(fund.name);
  const [description, setDescription] = useState(fund.description || "");
  const [selectedIcon, setSelectedIcon] = useState(fund.icon || "Wallet");
  const [selectedColor, setSelectedColor] = useState(fund.iconColor || "blue");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const hasChanges =
    name !== fund.name ||
    description !== (fund.description || "") ||
    selectedIcon !== (fund.icon || "Wallet") ||
    selectedColor !== (fund.iconColor || "blue");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError("Fund name is required");
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      setSuccessMessage(null);

      const input: UpdateFundInput = {
        name: name.trim(),
        description: description.trim() || undefined,
        icon: selectedIcon,
        iconColor: selectedColor,
      };

      await fundService.updateFund(fund.id, input);
      setSuccessMessage("Fund information updated successfully");
      onUpdate();

      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update fund");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setName(fund.name);
    setDescription(fund.description || "");
    setSelectedIcon(fund.icon || "Wallet");
    setSelectedColor(fund.iconColor || "blue");
    setError(null);
    setSuccessMessage(null);
  };

  const SelectedIconComponent = getIconByName(selectedIcon);
  const colorClasses = getColorClasses(selectedColor);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fund Information</CardTitle>
        <CardDescription>
          Customize your fund's name, description, icon, and color
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="rounded-md bg-red-50 dark:bg-red-950/50 p-3 text-sm text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800">
              {error}
            </div>
          )}

          {successMessage && (
            <div className="rounded-md bg-green-50 dark:bg-green-950/50 p-3 text-sm text-green-800 dark:text-green-200 border border-green-200 dark:border-green-800 flex items-center gap-2">
              <Check className="h-4 w-4" />
              {successMessage}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">Fund Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSaving}
              placeholder="e.g., Momentum Breakout Fund"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSaving}
              placeholder="Brief description of the fund's strategy or purpose"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Icon & Color</Label>
            <IconColorPicker
              selectedIcon={selectedIcon}
              selectedColor={selectedColor}
              onIconChange={setSelectedIcon}
              onColorChange={setSelectedColor}
              disabled={isSaving}
            />
          </div>

          <div className="space-y-2">
            <Label>Preview</Label>
            <div className="p-4 border rounded-md bg-muted/30 flex items-center gap-3">
              <div
                className={`
                p-3 rounded-lg ${colorClasses.bgClass} border ${colorClasses.borderClass}
              `}
              >
                <SelectedIconComponent
                  className={`h-6 w-6 ${colorClasses.textClass}`}
                />
              </div>
              <div>
                <div className="font-semibold">{name || "Fund Name"}</div>
                {description && (
                  <div className="text-sm text-muted-foreground">
                    {description}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={isSaving || !hasChanges}>
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
            {hasChanges && (
              <Button
                type="button"
                variant="outline"
                onClick={handleReset}
                disabled={isSaving}
              >
                Reset
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
