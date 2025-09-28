// Agent middleware for common concerns: auth, validation, rate limiting
import { NextRequest, NextResponse } from "next/server";

import { getServerUser } from "@/lib/auth/server";
import { log } from "@/lib/utils/logger";
import { withSecurity, aiRequestSecurity } from "@/lib/services/security-wrapper";

export interface AgentContext {
  user: {
    uid: string;
    email: string;
    displayName: string;
    role: string;
  };
  requestId: string;
  logger: string;
}

export interface AgentMiddlewareOptions {
  requireAuth?: boolean;
  logger: string;
  customSecurity?: any; // Allow custom security wrapper
}

/**
 * Agent middleware that handles common concerns:
 * - Authentication
 * - Rate limiting
 * - Request validation
 * - Logging setup
 * 
 * Returns a context object with user info and utilities
 */
export function withAgentMiddleware<T = any>(
  options: AgentMiddlewareOptions,
  handler: (request: NextRequest, context: AgentContext) => Promise<NextResponse<T>>
) {
  const securityWrapper = options.customSecurity || aiRequestSecurity;
  
  return withSecurity(securityWrapper, async (request: NextRequest) => {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      // Get authenticated user
      const user = await getServerUser();
      if (options.requireAuth !== false && !user) {
        return NextResponse.json(
          { error: "Authentication required" },
          { status: 401 }
        );
      }

      // Create context for the handler
      const context: AgentContext = {
        user: user ? {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          role: user.role
        } : {
          uid: 'anonymous',
          email: '',
          displayName: 'Anonymous',
          role: 'user'
        },
        requestId,
        logger: options.logger
      };

      log.info("Agent request started", {
        requestId,
        userId: context.user.uid,
        logger: options.logger
      }, options.logger);

      // Call the actual handler
      const response = await handler(request, context);

      log.success("Agent request completed", {
        requestId,
        userId: context.user.uid,
        status: response.status
      }, options.logger);

      return response;
    } catch (error) {
      log.error("Agent request failed", error, options.logger);
      return NextResponse.json(
        { error: "Request failed" },
        { status: 500 }
      );
    }
  });
}
