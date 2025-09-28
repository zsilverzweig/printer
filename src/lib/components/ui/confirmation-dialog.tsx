"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import { ReactNode } from "react";

import { Button } from "@/lib/components/ui/button";
import { Modal } from "@/lib/components/ui/modal";

interface ConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "destructive";
  isLoading?: boolean;
  loadingText?: string;
  size?: "sm" | "md" | "lg" | "xl" | "2xl";
}

export function ConfirmationDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  children,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "default",
  isLoading = false,
  loadingText = "Processing...",
  size = "sm",
}: ConfirmationDialogProps) {
  const isDestructive = variant === "destructive";

  return (
    <Modal
      open={isOpen}
      onOpenChange={onClose}
      title={title}
      size={size}
      footer={
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            {cancelText}
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isLoading}
            variant={isDestructive ? "destructive" : "default"}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {loadingText}
              </>
            ) : (
              confirmText
            )}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Custom content or default description */}
        {children ? (
          children
        ) : (
          <>
            {/* Icon and Description */}
            <div className="flex items-start gap-3">
              {isDestructive && (
                <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
              )}
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">{description}</p>
              </div>
            </div>

            {/* Warning for destructive actions */}
            {isDestructive && (
              <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3">
                <p className="text-xs text-destructive">
                  This action cannot be undone.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
