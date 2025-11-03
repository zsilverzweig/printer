/**
 * FundBasicInfoEditor Component
 *
 * Allows editing fund name, description, icon, and color.
 */

"use client";

import { Fund, UpdateFundInput } from "@shared/types";
import { useEffect, useRef, useState } from "react";

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

import { fundService } from "../services/fund-service";
import { IconColorPicker } from "./icon-color-picker";

interface FundBasicInfoEditorProps {
  fund: Fund;
  onUpdate: () => void;
  onSavingChange?: (saving: boolean) => void;
}

export function FundBasicInfoEditor({
  fund,
  onUpdate,
  onSavingChange,
}: FundBasicInfoEditorProps) {
  const [name, setName] = useState(fund.name);
  const [description, setDescription] = useState(fund.description || "");
  const [selectedIcon, setSelectedIcon] = useState(fund.icon || "Wallet");
  const [selectedColor, setSelectedColor] = useState(fund.iconColor || "blue");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);

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

  // Debounced autosave on change
  useEffect(() => {
    if (!name.trim()) {
      return;
    }

    const hasChanges =
      name !== fund.name ||
      description !== (fund.description || "") ||
      selectedIcon !== (fund.icon || "Wallet") ||
      selectedColor !== (fund.iconColor || "blue");

    if (!hasChanges) return;

    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }

    debounceRef.current = window.setTimeout(async () => {
      try {
        setIsSaving(true);
        onSavingChange?.(true);
        setError(null);

        const input: UpdateFundInput = {
          name: name.trim(),
          description: description.trim() || undefined,
          icon: selectedIcon,
          iconColor: selectedColor,
        };

        await fundService.updateFund(fund.id, input);
        onUpdate();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update fund");
      } finally {
        setIsSaving(false);
        onSavingChange?.(false);
      }
    }, 1500);

    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [
    name,
    description,
    selectedIcon,
    selectedColor,
    fund.id,
    fund.name,
    fund.description,
    fund.icon,
    fund.iconColor,
    onSavingChange,
    onUpdate,
  ]);

  const handleReset = () => {
    setName(fund.name);
    setDescription(fund.description || "");
    setSelectedIcon(fund.icon || "Wallet");
    setSelectedColor(fund.iconColor || "blue");
    setError(null);
    setSuccessMessage(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fund Information</CardTitle>
        <CardDescription>
          Customize your fund's name, description, icon, and color
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
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
                onIconChange={setSelectedIcon}
                onColorChange={setSelectedColor}
                disabled={isSaving}
              />
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
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
      </CardContent>
    </Card>
  );
}
