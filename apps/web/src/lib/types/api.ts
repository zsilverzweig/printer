// API response and security types

export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    requestId: string;
    timestamp: Date;
    processingTime: number;
    cost?: number;
    tokensUsed?: TokenUsage;
  };
}

export interface PaginatedResponse<T = unknown> extends APIResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (request: Request) => string;
}

export interface SecurityConfig {
  rateLimiter: RateLimitConfig;
  requireAuth: boolean;
  maxRequestSize?: number;
  allowedMethods?: string[];
  allowedOrigins?: string[];
}

export interface SecurityResult {
  success: boolean;
  response?: Response;
  clientIP?: string;
  userId?: string;
}

// Import TokenUsage from ai.ts
import { TokenUsage } from "./ai";
