import { Button } from "@/lib/components/ui/button";
import { ReactNode } from "react";

interface CardActionButtonProps {
  variant?: "default" | "outline" | "ghost" | "destructive" | "secondary" | "link";
  size?: "default" | "sm" | "lg" | "icon";
  onClick?: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  children: ReactNode;
  className?: string;
  title?: string;
}

/**
 * Standardized action button component for card headers
 * Provides consistent styling across all cards in the TCC
 */
export function CardActionButton({
  variant = "default",
  size = "sm",
  onClick,
  disabled = false,
  isLoading = false,
  children,
  className = "",
  title,
}: CardActionButtonProps) {
  return (
    <Button
      variant={variant}
      size={size}
      onClick={onClick}
      disabled={disabled || isLoading}
      className={`h-7 px-3 text-xs ${className}`}
      title={title}
    >
      {children}
    </Button>
  );
}

