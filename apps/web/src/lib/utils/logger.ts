/**
 * Logger utility for Printer
 * Provides environment-aware logging that only shows in development
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogEntry {
  level: LogLevel
  message: string
  data?: any
  timestamp: string
  source?: string
}

class Logger {
  private isDevelopment: boolean

  constructor() {
    this.isDevelopment = process.env.NODE_ENV === 'development'
  }

  private getLogLevel(): LogLevel {
    const envLevel = process.env.NEXT_PUBLIC_LOG_LEVEL?.toUpperCase()
    switch (envLevel) {
      case 'DEBUG': return LogLevel.DEBUG
      case 'INFO': return LogLevel.INFO
      case 'WARN': return LogLevel.WARN
      case 'ERROR': return LogLevel.ERROR
      default: return this.isDevelopment ? LogLevel.DEBUG : LogLevel.ERROR
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const currentLogLevel = this.getLogLevel()
    
    // Always respect the NEXT_PUBLIC_LOG_LEVEL environment variable
    // If NEXT_PUBLIC_LOG_LEVEL is set, use it regardless of NODE_ENV
    if (process.env.NEXT_PUBLIC_LOG_LEVEL) {
      return level >= currentLogLevel
    }
    
    // Fallback: only log in development if no LOG_LEVEL is set
    return this.isDevelopment && level >= currentLogLevel
  }

  private formatMessage(level: LogLevel, message: string, data?: any, source?: string): string {
    const timestamp = new Date().toISOString()
    const levelName = LogLevel[level]
    const sourcePrefix = source ? `[${source}] ` : ''
    
    if (data) {
      return `${timestamp} ${levelName}: ${sourcePrefix}${message}`
    }
    return `${timestamp} ${levelName}: ${sourcePrefix}${message}`
  }

  private log(level: LogLevel, message: string, data?: any, source?: string): void {
    if (!this.shouldLog(level)) return

    const formattedMessage = this.formatMessage(level, message, data, source)
    
    switch (level) {
      case LogLevel.DEBUG:
        console.log(formattedMessage, data || '')
        break
      case LogLevel.INFO:
        console.info(formattedMessage, data || '')
        break
      case LogLevel.WARN:
        console.warn(formattedMessage, data || '')
        break
      case LogLevel.ERROR:
        console.error(formattedMessage, data || '')
        break
    }
  }

  debug(message: string, data?: any, source?: string): void {
    this.log(LogLevel.DEBUG, message, data, source)
  }

  info(message: string, data?: any, source?: string): void {
    this.log(LogLevel.INFO, message, data, source)
  }

  warn(message: string, data?: any, source?: string): void {
    this.log(LogLevel.WARN, message, data, source)
  }

  error(message: string, data?: any, source?: string): void {
    this.log(LogLevel.ERROR, message, data, source)
  }

  // Success logging (info level with success emoji)
  success(message: string, data?: any, source?: string): void {
    this.log(LogLevel.INFO, `✅ ${message}`, data, source)
  }

  // Failure logging (error level with error emoji)
  failure(message: string, data?: any, source?: string): void {
    this.log(LogLevel.ERROR, `❌ ${message}`, data, source)
  }

  // Group logging for related operations
  group(name: string, callback: () => void): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return
    
    console.group(name)
    try {
      callback()
    } finally {
      console.groupEnd()
    }
  }

  // Time logging for performance measurement
  time(label: string): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return
    console.time(label)
  }

  timeEnd(label: string): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return
    console.timeEnd(label)
  }
}

// Create and export a singleton instance
export const logger = new Logger()

// Export convenience functions
export const log = {
  debug: (message: string, data?: any, source?: string) => logger.debug(message, data, source),
  info: (message: string, data?: any, source?: string) => logger.info(message, data, source),
  warn: (message: string, data?: any, source?: string) => logger.warn(message, data, source),
  error: (message: string, data?: any, source?: string) => logger.error(message, data, source),
  success: (message: string, data?: any, source?: string) => logger.success(message, data, source),
  failure: (message: string, data?: any, source?: string) => logger.failure(message, data, source),
  group: (name: string, callback: () => void) => logger.group(name, callback),
  time: (label: string) => logger.time(label),
  timeEnd: (label: string) => logger.timeEnd(label),
}

export default logger
