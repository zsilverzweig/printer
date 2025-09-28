"use client";

import { X } from "lucide-react";
import { ReactNode } from "react";

import { Button } from "@/lib/components/ui/button";
import { cn } from "@/lib/utils/utils";

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  footerActions?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "2xl";
  className?: string;
}

const sizeClasses = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
  "2xl": "max-w-5xl",
};

export function Modal({
  open,
  onOpenChange,
  title,
  children,
  footer,
  footerActions,
  size = "lg",
  className,
}: ModalProps) {
  if (!open) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          console.log("Modal backdrop clicked");
          onOpenChange(false);
        }
      }}
    >
      <div
        className={cn(
          "bg-background border border-border rounded-lg shadow-2xl w-full max-h-[95vh] overflow-hidden flex flex-col",
          sizeClasses[size],
          className
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-2xl font-bold text-foreground">{title}</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              console.log("Modal X button clicked");
              onOpenChange(false);
            }}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">{children}</div>

        {/* Footer */}
        {(footer || footerActions) && (
          <div className="flex justify-between items-center p-6 border-t border-border bg-muted/30">
            <div className="flex items-center">
              {footerActions}
            </div>
            <div className="flex justify-end space-x-3">
              {footer}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface ModalFormProps {
  id: string;
  onSubmit: (e: React.FormEvent) => void;
  children: ReactNode;
  className?: string;
}

export function ModalForm({
  id,
  onSubmit,
  children,
  className,
}: ModalFormProps) {
  return (
    <form id={id} onSubmit={onSubmit} className={cn("space-y-6", className)}>
      {children}
    </form>
  );
}

interface ModalSectionProps {
  title: string;
  children: ReactNode;
  className?: string;
}

export function ModalSection({
  title,
  children,
  className,
}: ModalSectionProps) {
  return (
    <div className={cn("space-y-4", className)}>
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      {children}
    </div>
  );
}

interface ModalFieldProps {
  label: string;
  children: ReactNode;
  required?: boolean;
  className?: string;
}

export function ModalField({
  label,
  children,
  required,
  className,
}: ModalFieldProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <label className="block text-sm font-medium text-foreground">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}
