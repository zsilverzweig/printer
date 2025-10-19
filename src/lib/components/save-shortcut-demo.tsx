"use client";

import { useCallback } from "react";

import { Button } from "@/lib/components/ui/button";
import { useShortcut } from "@/lib/hooks/use-shortcut";
import { toastSuccess } from "@/lib/utils/toast";

export function SaveShortcutDemo() {
  const onSave = useCallback(() => {
    toastSuccess("Saved", { description: "Triggered by ⌘S" });
  }, []);

  useShortcut("meta+s", onSave, [onSave]);

  return (
    <div className="flex items-center gap-3">
      <Button onClick={onSave}>Save</Button>
      <span className="text-sm text-muted-foreground">Press ⌘S to save</span>
    </div>
  );
}
