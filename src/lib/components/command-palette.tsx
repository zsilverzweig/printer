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

  useShortcut("meta+k", () => setOpen((v) => !v), [setOpen]);

  const navigate = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0 overflow-hidden">
        <Command>
          <CommandInput placeholder="Type a command or search..." />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
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
