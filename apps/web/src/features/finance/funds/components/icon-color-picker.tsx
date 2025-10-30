/**
 * IconColorPicker Component
 *
 * Minimal icon and color picker with a tiny button and dialog.
 */

"use client";

import { Button } from "@/lib/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/lib/components/ui/dialog";
import { Input } from "@/lib/components/ui/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/lib/components/ui/tabs";
import { Palette, Search } from "lucide-react";
import { useState } from "react";

import {
  COLOR_OPTIONS,
  getColorClasses,
  getIconByName,
  ICON_OPTIONS,
} from "../config/icon-options";

interface IconColorPickerProps {
  selectedIcon: string;
  selectedColor: string;
  onIconChange: (icon: string) => void;
  onColorChange: (color: string) => void;
  disabled?: boolean;
}

export function IconColorPicker({
  selectedIcon,
  selectedColor,
  onIconChange,
  onColorChange,
  disabled = false,
}: IconColorPickerProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const SelectedIconComponent = getIconByName(selectedIcon);
  const colorClasses = getColorClasses(selectedColor);

  // Filter icons based on search query
  const filteredIcons = ICON_OPTIONS.filter(
    (option) =>
      option.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      option.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className="gap-1.5 h-8 px-2"
        >
          <div
            className={`
              p-1 rounded ${colorClasses.bgClass} border ${colorClasses.borderClass}
            `}
          >
            <SelectedIconComponent
              className={`h-3 w-3 ${colorClasses.textClass}`}
            />
          </div>
          <Palette className="h-3 w-3 opacity-50" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>Choose Icon & Color</DialogTitle>
          <DialogDescription>
            Select an icon and color for your fund
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="icon" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="icon">Icon</TabsTrigger>
            <TabsTrigger value="color">Color</TabsTrigger>
          </TabsList>

          <TabsContent value="icon" className="space-y-3 mt-4">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search icons..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
            <div className="max-h-[400px] overflow-y-auto pr-2">
              <div className="grid grid-cols-8 gap-1">
                {filteredIcons.map((option) => {
                  const IconComponent = option.icon;
                  const isSelected = selectedIcon === option.name;
                  return (
                    <button
                      key={option.name}
                      type="button"
                      onClick={() => {
                        onIconChange(option.name);
                      }}
                      className={`
                        p-2 rounded-md border transition-all
                        flex items-center justify-center
                        hover:scale-110 hover:bg-accent
                        ${
                          isSelected
                            ? `${colorClasses.borderClass} ${colorClasses.bgClass}`
                            : "border-transparent"
                        }
                      `}
                      title={option.label}
                    >
                      <IconComponent
                        className={`h-4 w-4 ${
                          isSelected
                            ? colorClasses.textClass
                            : "text-foreground"
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
              {filteredIcons.length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-8">
                  No icons found
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="color" className="mt-4">
            <div className="grid grid-cols-4 gap-2 max-h-[400px] overflow-y-auto">
              {COLOR_OPTIONS.map((option) => {
                const isSelected = selectedColor === option.name;
                return (
                  <button
                    key={option.name}
                    type="button"
                    onClick={() => {
                      onColorChange(option.name);
                    }}
                    className={`
                      p-3 rounded-md border-2 transition-all
                      flex flex-col items-center justify-center gap-1.5
                      hover:scale-105
                      ${
                        isSelected
                          ? `${option.borderClass} ${option.bgClass}`
                          : "border-border hover:border-muted-foreground"
                      }
                    `}
                  >
                    <div
                      className={`w-6 h-6 rounded-full ${option.bgClass} border-2 ${option.borderClass}`}
                    />
                    <span className="text-[10px] font-medium">
                      {option.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
