// Centralized security wrapper for Printer API endpoints
import { NextRequest, NextResponse } from "next/server";

import { log } from "@/lib/utils/logger";

import { SecurityConfig, SecurityResult } from "../types/api";

import { RateLimiter } from "./rate-limiter";

export class SecurityWrapper {
  private config: SecurityConfig;

  constructor(config: SecurityConfig) {
    this.config = config;
  }

  async checkSecurity(request: NextRequest): Promise<SecurityResult> {
    // 1. Check HTTP method
    if (
      this.config.allowedMethods &&
      !this.config.allowedMethods.includes(request.method)
    ) {
      return {
        success: false,
        response: NextResponse.json(
          { error: `Method ${request.method} not allowed` },
          { status: 405 }
        ),
      };
    }

    // 2. Check request size
    if (this.config.maxRequestSize) {
      const contentLength = request.headers.get("content-length");
      if (
        contentLength &&
        parseInt(contentLength) > this.config.maxRequestSize
      ) {
        return {
          success: false,
          response: NextResponse.json(
            { error: "Request too large" },
            { status: 413 }
          ),
        };
      }
    }

    // 3. Check CORS if configured
    if (this.config.allowedOrigins) {
      const origin = request.headers.get("origin");
      if (origin && !this.config.allowedOrigins.includes(origin)) {
        return {
          success: false,
          response: NextResponse.json(
            { error: "Origin not allowed" },
            { status: 403 }
          ),
        };
      }
    }

    // 4. Rate limiting
    const rateLimiter = new RateLimiter(this.config.rateLimiter);
    const rateLimit = await rateLimiter.checkLimit(request);
    if (!rateLimit.allowed) {
      log.warn(
        "🚫 Rate limit exceeded",
        {
          remaining: rateLimit.remaining,
          retryAfter: rateLimit.retryAfter,
          clientIP: this.getClientIP(request),
        },
        "SecurityWrapper"
      );
      return {
        success: false,
        response: NextResponse.json(
          {
            error: "Rate limit exceeded. Please try again later.",
            retryAfter: rateLimit.retryAfter,
          },
          {
            status: 429,
            headers: {
              "Retry-After": rateLimit.retryAfter?.toString() || "60",
              "X-RateLimit-Limit":
                this.config.rateLimiter.maxRequests.toString(),
              "X-RateLimit-Remaining": rateLimit.remaining.toString(),
              "X-RateLimit-Reset": rateLimit.resetTime.toString(),
            },
          }
        ),
      };
    }

    // 5. Authentication (if required)
    if (this.config.requireAuth) {
      const authResult = await this.checkAuthentication(request);
      if (!authResult.success) {
        return authResult;
      }
    }

    const clientIP = this.getClientIP(request);
    log.info("✅ Security checks passed", { clientIP }, "SecurityWrapper");
    return {
      success: true,
      clientIP,
    };
  }

  private async checkAuthentication(
    request: NextRequest
  ): Promise<SecurityResult> {
    // TODO: Implement authentication logic
    // For now, just check for API key in headers
    const apiKey = request.headers.get("x-api-key");

    if (!apiKey) {
      return {
        success: false,
        response: NextResponse.json(
          { error: "API key required" },
          { status: 401 }
        ),
      };
    }

    // TODO: Validate API key against database
    // For now, just check if it's not empty
    if (apiKey.length < 10) {
      return {
        success: false,
        response: NextResponse.json(
          { error: "Invalid API key" },
          { status: 401 }
        ),
      };
    }

    return { success: true };
  }

  private getClientIP(request: NextRequest): string {
    const forwarded = request.headers.get("x-forwarded-for");
    const realIP = request.headers.get("x-real-ip");
    const cfConnectingIP = request.headers.get("cf-connecting-ip");

    return (
      cfConnectingIP ||
      realIP ||
      (forwarded ? forwarded.split(",")[0] : "unknown")
    );
  }
}

// Pre-configured security wrappers for different endpoints
export const aiRequestSecurity = new SecurityWrapper({
  rateLimiter: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10, // 10 requests per minute per IP
  },
  requireAuth: false, // Will be enabled in production
  maxRequestSize: 50 * 1024, // 50KB
  allowedMethods: ["POST"],
});

export const companyResearchSecurity = new SecurityWrapper({
  rateLimiter: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 3, // 3 requests per minute per IP
  },
  requireAuth: false,
  maxRequestSize: 10 * 1024, // 10KB
  allowedMethods: ["POST"],
});

export const tradeAnalysisSecurity = new SecurityWrapper({
  rateLimiter: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 5, // 5 requests per minute per IP
  },
  requireAuth: false,
  maxRequestSize: 20 * 1024, // 20KB
  allowedMethods: ["POST"],
});

export const patternMatchingSecurity = new SecurityWrapper({
  rateLimiter: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 8, // 8 requests per minute per IP
  },
  requireAuth: false,
  maxRequestSize: 15 * 1024, // 15KB
  allowedMethods: ["POST"],
});

export const adminSecurity = new SecurityWrapper({
  rateLimiter: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 20, // 20 requests per minute per IP
  },
  requireAuth: true, // Admin endpoints require authentication
  maxRequestSize: 100 * 1024, // 100KB
  allowedMethods: ["GET", "POST", "PUT", "DELETE"],
});

// Helper function to wrap API handlers
export function withSecurity(
  securityWrapper: SecurityWrapper,
  handler: (request: NextRequest, clientIP?: string) => Promise<NextResponse>
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const securityResult = await securityWrapper.checkSecurity(request);

    if (!securityResult.success) {
      return securityResult.response! as NextResponse;
    }

    return handler(request, securityResult.clientIP);
  };
}
