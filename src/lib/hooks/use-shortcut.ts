"use client";

import { useHotkeys, type HotkeysEvent } from "react-hotkeys-hook";

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
};

export function useShortcut(
  keys: string,
  handler: (event: KeyboardEvent) => void,
  deps: unknown[] = [],
  options?: { preventDefault?: boolean }
) {
  useHotkeys(
    keys,
    (event: KeyboardEvent, _hotkeysEvent: HotkeysEvent) => {
      if (options?.preventDefault !== false) event.preventDefault();
      handler(event);
    },
    {
      filter: (e) => !isEditableTarget(e?.target),
      enableOnContentEditable: false,
    },
    deps
  );
}
