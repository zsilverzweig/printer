"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/lib/components/ui/command";
import { Dialog, DialogContent } from "@/lib/components/ui/dialog";
import { useShortcut } from "@/lib/hooks/use-shortcut";

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  useShortcut("meta+k", () => setOpen((v) => !v), [setOpen]);

  const navigate = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const trimmedQuery = query.trim();
  const hasQuery = trimmedQuery.length > 0;
  const knownLabels = [
    "Company Research",
    "Trading",
    "Screener",
    "Portfolios",
    "Admin · AI Sandbox",
  ];
  const hasMatches = knownLabels.some((label) =>
    label.toLowerCase().includes(trimmedQuery.toLowerCase())
  );

  const handleShowTicker = () => {
    const symbol = trimmedQuery.toUpperCase();
    if (!symbol) return;
    navigate(`/stocks/${symbol}`);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0 overflow-hidden">
        <Command>
          <CommandInput
            placeholder="Type a command or search..."
            value={query}
            onValueChange={setQuery}
            onKeyDown={(e) => {
              if (e.key === "Enter" && hasQuery && !hasMatches) {
                e.preventDefault();
                handleShowTicker();
              }
            }}
          />
          <CommandList>
            <CommandEmpty>
              {hasQuery ? (
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm"
                  onClick={handleShowTicker}
                >
                  Show Ticker: {trimmedQuery.toUpperCase()}
                </button>
              ) : (
                "No results found."
              )}
            </CommandEmpty>
            <CommandGroup heading="Navigate">
              <CommandItem onSelect={() => navigate("/company-research")}>
                Company Research
              </CommandItem>
              <CommandItem onSelect={() => navigate("/trading")}>
                Trading
              </CommandItem>
              <CommandItem onSelect={() => navigate("/screener")}>
                Screener
              </CommandItem>
              <CommandItem onSelect={() => navigate("/portfolios")}>
                Portfolios
              </CommandItem>
              <CommandItem onSelect={() => navigate("/admin/ai-sandbox")}>
                Admin · AI Sandbox
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
