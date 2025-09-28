import * as React from "react"
import { cn } from "@/lib/utils/utils"

export interface SubtleStatesProps extends React.HTMLAttributes<HTMLDivElement> {
  selected?: boolean
  interactive?: boolean
  variant?: "default" | "card" | "list"
}

const SubtleStates = React.forwardRef<HTMLDivElement, SubtleStatesProps>(
  ({ className, selected = false, interactive = true, variant = "default", ...props }, ref) => {
    const baseClasses = {
      default: "p-4",
      card: "p-4 rounded-lg",
      list: "p-4"
    }

    return (
      <div
        ref={ref}
        className={cn(
          baseClasses[variant],
          // Use utility classes for consistent subtle states
          interactive && !selected && "subtle-interactive",
          selected && "subtle-interactive-selected",
          className
        )}
        {...props}
      />
    )
  }
)
SubtleStates.displayName = "SubtleStates"

export { SubtleStates }
