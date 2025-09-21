// Advanced rate limiter for Printer AI operations
import { RateLimitConfig } from '../types/api'

interface RateLimitEntry {
  count: number
  resetTime: number
  lastRequest: number
}

const rateLimitStore = new Map<string, RateLimitEntry>()

export class RateLimiter {
  private config: RateLimitConfig

  constructor(config: RateLimitConfig) {
    this.config = config
  }

  private getKey(request: Request): string {
    if (this.config.keyGenerator) {
      return this.config.keyGenerator(request)
    }

    // Default: Use IP address with user agent for better uniqueness
    const forwarded = request.headers.get('x-forwarded-for')
    const ip = forwarded ? forwarded.split(',')[0] : 'unknown'
    const userAgent = request.headers.get('user-agent') || 'unknown'
    
    return `${ip}:${userAgent.slice(0, 50)}` // Limit user agent length
  }

  private cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of rateLimitStore.entries()) {
      if (now > entry.resetTime) {
        rateLimitStore.delete(key)
      }
    }
  }

  async checkLimit(request: Request): Promise<{
    allowed: boolean
    remaining: number
    resetTime: number
    retryAfter?: number
  }> {
    this.cleanup()

    const key = this.getKey(request)
    const now = Date.now()

    let entry = rateLimitStore.get(key)

    if (!entry || now > entry.resetTime) {
      // New window or expired entry
      entry = {
        count: 1,
        resetTime: now + this.config.windowMs,
        lastRequest: now,
      }
      rateLimitStore.set(key, entry)

      return {
        allowed: true,
        remaining: this.config.maxRequests - 1,
        resetTime: entry.resetTime,
      }
    }

    if (entry.count >= this.config.maxRequests) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000)
      return {
        allowed: false,
        remaining: 0,
        resetTime: entry.resetTime,
        retryAfter,
      }
    }

    entry.count++
    entry.lastRequest = now
    rateLimitStore.set(key, entry)

    return {
      allowed: true,
      remaining: this.config.maxRequests - entry.count,
      resetTime: entry.resetTime,
    }
  }

  // Get current status for a key without incrementing
  getStatus(request: Request): {
    remaining: number
    resetTime: number
    isLimited: boolean
  } {
    const key = this.getKey(request)
    const entry = rateLimitStore.get(key)
    const now = Date.now()

    if (!entry || now > entry.resetTime) {
      return {
        remaining: this.config.maxRequests,
        resetTime: now + this.config.windowMs,
        isLimited: false,
      }
    }

    return {
      remaining: Math.max(0, this.config.maxRequests - entry.count),
      resetTime: entry.resetTime,
      isLimited: entry.count >= this.config.maxRequests,
    }
  }

  // Reset rate limit for a specific key (admin function)
  reset(key: string): void {
    rateLimitStore.delete(key)
  }

  // Get all active rate limits (admin function)
  getAllLimits(): Array<{
    key: string
    count: number
    remaining: number
    resetTime: number
    lastRequest: number
  }> {
    const now = Date.now()
    const limits: Array<{
      key: string
      count: number
      remaining: number
      resetTime: number
      lastRequest: number
    }> = []

    for (const [key, entry] of rateLimitStore.entries()) {
      if (now <= entry.resetTime) {
        limits.push({
          key,
          count: entry.count,
          remaining: Math.max(0, this.config.maxRequests - entry.count),
          resetTime: entry.resetTime,
          lastRequest: entry.lastRequest,
        })
      }
    }

    return limits
  }
}

// Pre-configured rate limiters for different operations
export const aiRequestRateLimiter = new RateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10, // 10 AI requests per minute per IP
})

export const companyResearchRateLimiter = new RateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 3, // 3 company research requests per minute per IP
})

export const tradeAnalysisRateLimiter = new RateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 5, // 5 trade analysis requests per minute per IP
})

export const patternMatchingRateLimiter = new RateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 8, // 8 pattern matching requests per minute per IP
})

export const strictRateLimiter = new RateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 50, // 50 requests per hour per IP
})

export const adminRateLimiter = new RateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 20, // 20 admin requests per minute per IP
})
