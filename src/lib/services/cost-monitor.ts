// Advanced cost monitoring and alerting system for Printer AI operations
import { log } from '@/lib/utils/logger'
import { AIOperation, CostEntry, TokenUsage } from '../types'

interface CostLimits {
  daily: number
  hourly: number
  perRequest: number
  perOperation: Record<AIOperation, number>
}

interface AlertConfig {
  enabled: boolean
  thresholds: {
    warning: number
    critical: number
  }
  channels: ('console' | 'email' | 'slack')[]
}

class CostMonitor {
  private costs: CostEntry[] = []
  private limits: CostLimits
  private alertConfig: AlertConfig
  private operationCosts: Map<AIOperation, number> = new Map()

  // AI Model pricing (per 1M tokens) - updated for 2024
  private pricing = {
    'gpt-4o': { input: 2.50, output: 10.00 },
    'gpt-4o-mini': { input: 0.15, output: 0.60 },
    'gpt-4-turbo': { input: 10.00, output: 30.00 },
    'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
    'claude-3-5-sonnet': { input: 3.00, output: 15.00 },
    'claude-3-5-haiku': { input: 0.80, output: 4.00 },
    'claude-3-opus': { input: 15.00, output: 75.00 },
    'gemini-pro': { input: 0.50, output: 1.50 },
    'gemini-pro-vision': { input: 0.25, output: 0.75 },
  }

  constructor(limits?: Partial<CostLimits>, alertConfig?: Partial<AlertConfig>) {
    this.limits = {
      daily: limits?.daily || 50, // $50 daily limit
      hourly: limits?.hourly || 10, // $10 hourly limit
      perRequest: limits?.perRequest || 5, // $5 per request limit
      perOperation: limits?.perOperation || {
        company_research: 10,
        trade_analysis: 5,
        thesis_generation: 3,
        pattern_matching: 2,
        risk_assessment: 2,
        market_analysis: 3,
        competitive_analysis: 3,
        financial_analysis: 2,
      },
    }

    this.alertConfig = {
      enabled: alertConfig?.enabled ?? true,
      thresholds: {
        warning: alertConfig?.thresholds?.warning || 0.8, // 80% of limit
        critical: alertConfig?.thresholds?.critical || 0.95, // 95% of limit
      },
      channels: alertConfig?.channels || ['console'],
    }
  }

  /**
   * Record a cost entry for an AI operation
   */
  recordCost(entry: Omit<CostEntry, 'id' | 'timestamp' | 'cost'>): void {
    const model = entry.model.toLowerCase()
    const pricing = this.pricing[model as keyof typeof this.pricing]

    if (!pricing) {
      log.warn('Unknown model pricing', { model }, 'CostMonitor')
      return
    }

    const inputCost = (entry.tokensUsed.promptTokens / 1000000) * pricing.input
    const outputCost = (entry.tokensUsed.completionTokens / 1000000) * pricing.output
    const totalCost = inputCost + outputCost

    const costEntry: CostEntry = {
      ...entry,
      id: this.generateId(),
      timestamp: new Date(),
      cost: totalCost,
    }

    this.costs.push(costEntry)

    // Update operation-specific costs
    if (entry.operation) {
      const currentCost = this.operationCosts.get(entry.operation) || 0
      this.operationCosts.set(entry.operation, currentCost + totalCost)
    }

    log.info('Cost recorded', {
      cost: totalCost.toFixed(4),
      operation: entry.operation,
      model: entry.model,
      tokens: entry.tokensUsed.totalTokens
    }, 'CostMonitor')

    // Check limits and send alerts
    this.checkLimits()
  }

  /**
   * Check all cost limits and send alerts if necessary
   */
  private checkLimits(): void {
    const now = Date.now()
    const oneHourAgo = now - 60 * 60 * 1000
    const oneDayAgo = now - 24 * 60 * 60 * 1000

    // Calculate current costs
    const hourlyCost = this.getTotalCost('hour')
    const dailyCost = this.getTotalCost('day')

    // Check hourly limit
    if (hourlyCost > this.limits.hourly) {
      this.sendAlert('hourly', hourlyCost, this.limits.hourly, 'critical')
    } else if (hourlyCost > this.limits.hourly * this.alertConfig.thresholds.warning) {
      this.sendAlert('hourly', hourlyCost, this.limits.hourly, 'warning')
    }

    // Check daily limit
    if (dailyCost > this.limits.daily) {
      this.sendAlert('daily', dailyCost, this.limits.daily, 'critical')
    } else if (dailyCost > this.limits.daily * this.alertConfig.thresholds.warning) {
      this.sendAlert('daily', dailyCost, this.limits.daily, 'warning')
    }

    // Check operation-specific limits
    for (const [operation, cost] of this.operationCosts.entries()) {
      const limit = this.limits.perOperation[operation]
      if (cost > limit) {
        this.sendAlert('operation', cost, limit, 'critical', operation)
      } else if (cost > limit * this.alertConfig.thresholds.warning) {
        this.sendAlert('operation', cost, limit, 'warning', operation)
      }
    }

    // Log current status
    log.info('Cost status', {
      hourlyCost: hourlyCost.toFixed(2),
      hourlyLimit: this.limits.hourly,
      dailyCost: dailyCost.toFixed(2),
      dailyLimit: this.limits.daily
    }, 'CostMonitor')
  }

  /**
   * Send alert through configured channels
   */
  private sendAlert(
    type: 'hourly' | 'daily' | 'operation',
    current: number,
    limit: number,
    severity: 'warning' | 'critical',
    operation?: AIOperation
  ): void {
    if (!this.alertConfig.enabled) return

    const percentage = (current / limit) * 100
    const emoji = severity === 'critical' ? '🚨' : '⚠️'
    
    let message: string
    if (type === 'operation') {
      message = `${emoji} ${severity.toUpperCase()} COST ALERT: ${operation} operation limit exceeded! Current: $${current.toFixed(2)}, Limit: $${limit} (${percentage.toFixed(1)}%)`
    } else {
      message = `${emoji} ${severity.toUpperCase()} COST ALERT: ${type.toUpperCase()} limit exceeded! Current: $${current.toFixed(2)}, Limit: $${limit} (${percentage.toFixed(1)}%)`
    }

    // Send to configured channels
    for (const channel of this.alertConfig.channels) {
      switch (channel) {
        case 'console':
          if (severity === 'critical') {
            log.error('Cost alert', { message, type, current, limit, severity }, 'CostMonitor')
          } else {
            log.warn('Cost alert', { message, type, current, limit, severity }, 'CostMonitor')
          }
          break
        case 'email':
          // TODO: Implement email alerts
          log.info('Email alert', { message }, 'CostMonitor')
          break
        case 'slack':
          // TODO: Implement Slack alerts
          log.info('Slack alert', { message }, 'CostMonitor')
          break
      }
    }
  }

  /**
   * Get total cost for a specific timeframe
   */
  getTotalCost(timeframe: 'hour' | 'day' | 'all' = 'day'): number {
    return this.getCosts(timeframe).reduce((sum, cost) => sum + cost.cost, 0)
  }

  /**
   * Get cost entries for a specific timeframe
   */
  getCosts(timeframe: 'hour' | 'day' | 'all' = 'day'): CostEntry[] {
    const now = Date.now()
    let cutoff: number

    switch (timeframe) {
      case 'hour':
        cutoff = now - 60 * 60 * 1000
        break
      case 'day':
        cutoff = now - 24 * 60 * 60 * 1000
        break
      default:
        cutoff = 0
    }

    return this.costs.filter((cost) => cost.timestamp.getTime() > cutoff)
  }

  /**
   * Get cost breakdown by operation
   */
  getCostBreakdown(): Record<AIOperation, number> {
    const breakdown: Record<string, number> = {}
    
    for (const [operation, cost] of this.operationCosts.entries()) {
      breakdown[operation] = cost
    }

    return breakdown as Record<AIOperation, number>
  }

  /**
   * Get performance metrics
   */
  getMetrics(): {
    totalCost: number
    hourlyCost: number
    dailyCost: number
    averageCostPerRequest: number
    totalRequests: number
    operationBreakdown: Record<AIOperation, number>
    tokenEfficiency: number
  } {
    const totalCost = this.getTotalCost('all')
    const hourlyCost = this.getTotalCost('hour')
    const dailyCost = this.getTotalCost('day')
    const totalRequests = this.costs.length
    const averageCostPerRequest = totalRequests > 0 ? totalCost / totalRequests : 0

    // Calculate token efficiency (cost per 1K tokens)
    const totalTokens = this.costs.reduce((sum, cost) => sum + cost.tokensUsed.totalTokens, 0)
    const tokenEfficiency = totalTokens > 0 ? (totalCost / totalTokens) * 1000 : 0

    return {
      totalCost,
      hourlyCost,
      dailyCost,
      averageCostPerRequest,
      totalRequests,
      operationBreakdown: this.getCostBreakdown(),
      tokenEfficiency,
    }
  }

  /**
   * Update cost limits
   */
  setLimits(limits: Partial<CostLimits>): void {
    this.limits = { ...this.limits, ...limits }
    log.info('Cost limits updated', this.limits, 'CostMonitor')
  }

  /**
   * Update alert configuration
   */
  setAlertConfig(config: Partial<AlertConfig>): void {
    this.alertConfig = { ...this.alertConfig, ...config }
    log.info('Alert config updated', this.alertConfig, 'CostMonitor')
  }

  /**
   * Clean up old cost entries (keep last 30 days)
   */
  cleanup(): void {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
    const initialLength = this.costs.length
    
    this.costs = this.costs.filter((cost) => cost.timestamp.getTime() > thirtyDaysAgo)
    
    const removed = initialLength - this.costs.length
    if (removed > 0) {
      log.info('Cleaned up old cost entries', { removed }, 'CostMonitor')
    }
  }

  /**
   * Estimate tokens for text (rough approximation)
   */
  static estimateTokens(text: string): number {
    // Rough estimate: 1 token ≈ 4 characters for English text
    // More accurate for code: 1 token ≈ 3 characters
    return Math.ceil(text.length / 4)
  }

  /**
   * Generate unique ID for cost entries
   */
  private generateId(): string {
    return `cost_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}

// Global cost monitor instance
export const costMonitor = new CostMonitor()

// Helper function to record AI costs
export function recordAICost(
  operation: AIOperation,
  agentId: string,
  model: string,
  tokensUsed: TokenUsage,
  userId?: string,
  sessionId?: string,
  metadata?: Record<string, unknown>
): void {
  costMonitor.recordCost({
    operation,
    agentId,
    model,
    tokensUsed,
    userId,
    sessionId,
    metadata,
  })
}

// Helper function to estimate cost before making request
export function estimateCost(
  model: string,
  estimatedInputTokens: number,
  estimatedOutputTokens: number
): number {
  const pricing = costMonitor['pricing'][model.toLowerCase() as keyof typeof costMonitor['pricing']]
  
  if (!pricing) {
    console.warn(`⚠️ Unknown model pricing for estimation: ${model}`)
    return 0
  }

  const inputCost = (estimatedInputTokens / 1000000) * pricing.input
  const outputCost = (estimatedOutputTokens / 1000000) * pricing.output
  
  return inputCost + outputCost
}

export default costMonitor
