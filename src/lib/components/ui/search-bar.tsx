"use client";

import { Search } from "lucide-react";
import { forwardRef } from "react";

import { Input } from "@/lib/components/ui/input";
import { cn } from "@/lib/utils/utils";

export interface SearchBarProps extends React.InputHTMLAttributes<HTMLInputElement> {
  placeholder?: string;
}

const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(
  ({ className, placeholder = "Search...", ...props }, ref) => {
    return (
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={ref}
          className={cn("pl-10", className)}
          placeholder={placeholder}
          {...props}
        />
      </div>
    );
  }
);
SearchBar.displayName = "SearchBar";

export { SearchBar };
