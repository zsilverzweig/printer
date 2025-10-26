import * as React from "react"

import { cn } from "@/lib/utils/utils"

export interface ListItemProps extends React.HTMLAttributes<HTMLDivElement> {
  selected?: boolean
  interactive?: boolean
}

const ListItem = React.forwardRef<HTMLDivElement, ListItemProps>(
  ({ className, selected = false, interactive = true, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "p-4",
        // Use utility classes for consistent subtle states
        interactive && !selected && "subtle-interactive",
        selected && "subtle-interactive-selected",
        className
      )}
      {...props}
    />
  )
)
ListItem.displayName = "ListItem"

export { ListItem }
