/**
 * Toast notification utilities for Printer
 * Integrates with Sonner and existing logger system
 */

import { toast } from 'sonner'
import { logger } from './logger'

export interface ToastOptions {
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
  cancel?: {
    label: string
    onClick: () => void
  }
  duration?: number
  id?: string
}

/**
 * Show a success toast notification
 */
export const toastSuccess = (message: string, options?: ToastOptions) => {
  logger.success(message, options, 'toast')
  return toast.success(message, {
    description: options?.description,
    action: options?.action,
    cancel: options?.cancel,
    duration: options?.duration || 4000,
    id: options?.id,
  })
}

/**
 * Show an error toast notification
 */
export const toastError = (message: string, options?: ToastOptions) => {
  logger.error(message, options, 'toast')
  return toast.error(message, {
    description: options?.description,
    action: options?.action,
    cancel: options?.cancel,
    duration: options?.duration || 6000, // Errors stay longer
    id: options?.id,
  })
}

/**
 * Show a warning toast notification
 */
export const toastWarning = (message: string, options?: ToastOptions) => {
  logger.warn(message, options, 'toast')
  return toast.warning(message, {
    description: options?.description,
    action: options?.action,
    cancel: options?.cancel,
    duration: options?.duration || 5000,
    id: options?.id,
  })
}

/**
 * Show an info toast notification
 */
export const toastInfo = (message: string, options?: ToastOptions) => {
  logger.info(message, options, 'toast')
  return toast.info(message, {
    description: options?.description,
    action: options?.action,
    cancel: options?.cancel,
    duration: options?.duration || 4000,
    id: options?.id,
  })
}

/**
 * Show a loading toast notification
 */
export const toastLoading = (message: string, options?: Omit<ToastOptions, 'duration'>) => {
  logger.info(`Loading: ${message}`, options, 'toast')
  return toast.loading(message, {
    description: options?.description,
    action: options?.action,
    cancel: options?.cancel,
    id: options?.id,
  })
}

/**
 * Update an existing toast (useful for loading states)
 */
export const toastUpdate = (id: string, message: string, options?: ToastOptions) => {
  logger.info(`Updated: ${message}`, options, 'toast')
  // Dismiss the old toast and show a new one
  toast.dismiss(id)
  return toast(message, {
    description: options?.description,
    action: options?.action,
    cancel: options?.cancel,
    duration: options?.duration,
    id: options?.id || id,
  })
}

/**
 * Dismiss a specific toast
 */
export const toastDismiss = (id: string) => {
  logger.debug(`Dismissed toast: ${id}`, undefined, 'toast')
  return toast.dismiss(id)
}

/**
 * Dismiss all toasts
 */
export const toastDismissAll = () => {
  logger.debug('Dismissed all toasts', undefined, 'toast')
  return toast.dismiss()
}

/**
 * Promise-based toast for async operations
 */
export const toastPromise = <T>(
  promise: Promise<T>,
  messages: {
    loading: string
    success: string | ((data: T) => string)
    error: string | ((error: any) => string)
  },
  options?: ToastOptions
) => {
  logger.info(`Promise toast: ${messages.loading}`, options, 'toast')
  
  return toast.promise(promise, {
    loading: messages.loading,
    success: (data) => {
      const message = typeof messages.success === 'function' 
        ? messages.success(data) 
        : messages.success
      logger.success(`Promise resolved: ${message}`, { data }, 'toast')
      return message
    },
    error: (error) => {
      const message = typeof messages.error === 'function' 
        ? messages.error(error) 
        : messages.error
      logger.error(`Promise rejected: ${message}`, { error }, 'toast')
      return message
    },
    ...options,
  })
}

/**
 * API-specific toast helpers
 */
export const apiToast = {
  success: (message: string, data?: any) => 
    toastSuccess(message, { 
      description: data ? `Request completed successfully` : undefined 
    }),
  
  error: (message: string, error?: any) => 
    toastError(message, { 
      description: error?.message || 'An unexpected error occurred' 
    }),
  
  loading: (message: string) => 
    toastLoading(message, { 
      description: 'Please wait while we process your request' 
    }),
  
  promise: <T>(promise: Promise<T>, operation: string) =>
    toastPromise(promise, {
      loading: `${operation}...`,
      success: `${operation} completed successfully`,
      error: `Failed to ${operation.toLowerCase()}`
    })
}

/**
 * Auth-specific toast helpers
 */
export const authToast = {
  loginSuccess: () => toastSuccess('Welcome back!', { 
    description: 'You have been successfully logged in' 
  }),
  
  loginError: (error?: string) => toastError('Login failed', { 
    description: error || 'Please check your credentials and try again' 
  }),
  
  logoutSuccess: () => toastSuccess('Logged out successfully'),
  
  sessionExpired: () => toastWarning('Session expired', { 
    description: 'Please log in again to continue' 
  }),
  
  unauthorized: () => toastError('Access denied', { 
    description: 'You do not have permission to perform this action' 
  })
}

/**
 * Investment research specific toast helpers
 */
export const researchToast = {
  analysisStarted: (company: string) => 
    toastLoading(`Starting analysis for ${company}`, {
      description: 'Our AI agents are gathering data and insights'
    }),
  
  analysisComplete: (company: string) => 
    toastSuccess(`Analysis complete for ${company}`, {
      description: 'Investment thesis and recommendations are ready'
    }),
  
  analysisError: (company: string, error?: string) => 
    toastError(`Analysis failed for ${company}`, {
      description: error || 'Unable to complete the investment analysis'
    }),
  
  portfolioUpdated: () => 
    toastSuccess('Portfolio updated', {
      description: 'Your investment portfolio has been refreshed'
    })
}

// Export the main toast function for direct use
export { toast }
