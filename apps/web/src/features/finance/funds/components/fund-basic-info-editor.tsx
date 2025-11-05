/**
 * FundBasicInfoEditor Component
 *
 * Allows editing fund name, description, icon, and color.
 */

"use client";

import { Fund, UpdateFundInput } from "@shared/types";
import { useEffect, useState } from "react";

import { Button } from "@/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import { Input } from "@/lib/components/ui/input";
import { Label } from "@/lib/components/ui/label";
import { Textarea } from "@/lib/components/ui/textarea";

import { fundService } from "../services/fund-service";
import { IconColorPicker } from "./icon-color-picker";

interface FundBasicInfoEditorProps {
  fund: Fund;
  onUpdate: () => void;
  onSavingChange?: (saving: boolean) => void;
  noCard?: boolean;
}

export function FundBasicInfoEditor({
  fund,
  onUpdate,
  onSavingChange,
  noCard = false,
}: FundBasicInfoEditorProps) {
  const [name, setName] = useState(fund.name);
  const [description, setDescription] = useState(fund.description || "");
  const [selectedIcon, setSelectedIcon] = useState(fund.icon || "Wallet");
  const [selectedColor, setSelectedColor] = useState(fund.iconColor || "blue");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync local state with fund prop when it changes
  useEffect(() => {
    setName(fund.name);
    setDescription(fund.description || "");
    setSelectedIcon(fund.icon || "Wallet");
    setSelectedColor(fund.iconColor || "blue");
  }, [fund]);

  const hasChanges =
    name !== fund.name ||
    description !== (fund.description || "") ||
    selectedIcon !== (fund.icon || "Wallet") ||
    selectedColor !== (fund.iconColor || "blue");

  const saveIfChanged = async (
    overrides?: Partial<{
      name: string;
      description: string;
      selectedIcon: string;
      selectedColor: string;
    }>
  ) => {
    const nextName = (overrides?.name ?? name).trim();
    const nextDescription = (overrides?.description ?? description).trim();
    const nextIcon = overrides?.selectedIcon ?? selectedIcon;
    const nextColor = overrides?.selectedColor ?? selectedColor;

    if (!nextName) return;

    const hasChanges =
      nextName !== fund.name ||
      nextDescription !== (fund.description || "") ||
      nextIcon !== (fund.icon || "Wallet") ||
      nextColor !== (fund.iconColor || "blue");

    if (!hasChanges) return;

    try {
      setIsSaving(true);
      onSavingChange?.(true);
      setError(null);

      const input: UpdateFundInput = {
        name: nextName,
        description: nextDescription || undefined,
        icon: nextIcon,
        iconColor: nextColor,
      };

      await fundService.updateFund(fund.id, input);
      onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update fund");
    } finally {
      setIsSaving(false);
      onSavingChange?.(false);
    }
  };

  const handleReset = () => {
    setName(fund.name);
    setDescription(fund.description || "");
    setSelectedIcon(fund.icon || "Wallet");
    setSelectedColor(fund.iconColor || "blue");
    setError(null);
  };

  const content = (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md bg-red-50 dark:bg-red-950/50 p-3 text-sm text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="name">Fund Name</Label>
        <div className="flex items-center gap-2">
          <IconColorPicker
            selectedIcon={selectedIcon}
            selectedColor={selectedColor}
            onIconChange={(val) => {
              setSelectedIcon(val);
              void saveIfChanged({ selectedIcon: val });
            }}
            onColorChange={(val) => {
              setSelectedColor(val);
              void saveIfChanged({ selectedColor: val });
            }}
            disabled={isSaving}
          />
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              void saveIfChanged();
            }}
            disabled={isSaving}
            placeholder="e.g., Momentum Breakout Fund"
            className="flex-1"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => {
            void saveIfChanged();
          }}
          disabled={isSaving}
          placeholder="Brief description of the fund's strategy or purpose"
          rows={3}
        />
      </div>

      {hasChanges && (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleReset}
            disabled={isSaving}
          >
            Reset
          </Button>
        </div>
      )}
    </div>
  );

  if (noCard) {
    return content;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fund Information</CardTitle>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}
