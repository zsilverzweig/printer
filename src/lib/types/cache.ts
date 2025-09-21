// Caching and performance monitoring types
import { AIOperation, TokenUsage } from './ai'

export interface CacheEntry {
  id: string
  key: string
  data: unknown
  timestamp: Date
  expiresAt: Date
  hitCount: number
  lastAccessed: Date
  metadata?: Record<string, unknown>
}

export interface CacheStats {
  totalEntries: number
  hitRate: number
  missRate: number
  averageAccessTime: number
  memoryUsage: number
  evictionCount: number
}

export interface CostEntry {
  id: string
  operation: AIOperation
  agentId: string
  model: string
  tokensUsed: TokenUsage
  cost: number
  timestamp: Date
  userId?: string
  sessionId?: string
  metadata?: Record<string, unknown>
}

export interface PerformanceMetrics {
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  averageResponseTime: number
  totalCost: number
  averageCost: number
  cacheHitRate: number
  tokenEfficiency: number
}

// Import TokenUsage from ai.ts

