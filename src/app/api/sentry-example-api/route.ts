import * as Sentry from "@sentry/nextjs";

import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

class SentryExampleAPIError extends Error {
  constructor(message: string | undefined) {
    super(message);
    this.name = "SentryExampleAPIError";
  }
}

// A faulty API route to test Sentry's error monitoring
export async function GET() {
  logger.info("Sentry example API called", { 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN ? "configured" : "missing"
  });

  try {
    logger.debug("About to throw SentryExampleAPIError");
    
    // This will throw an error to test Sentry
    throw new SentryExampleAPIError("This error is raised on the backend called by the example page.");
  } catch (error) {
    logger.error("Caught error in Sentry API route", { 
      error: error instanceof Error ? error.message : String(error),
      errorName: error instanceof Error ? error.name : 'Unknown',
      stack: error instanceof Error ? error.stack : undefined
    });
    
    // Capture the error with Sentry
    try {
      Sentry.captureException(error);
      logger.info("Error captured by Sentry successfully");
    } catch (sentryError) {
      logger.error("Failed to capture error with Sentry", { 
        sentryError: sentryError instanceof Error ? sentryError.message : String(sentryError)
      });
    }
    
    // Re-throw to return 500 status
    throw error;
  }
  
}
