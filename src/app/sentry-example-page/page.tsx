"use client";

import { logger } from "@/lib/utils/logger";
import * as Sentry from "@sentry/nextjs";
import Head from "next/head";
import { useEffect, useState } from "react";
import styles from "./page.module.css";

class SentryExampleFrontendError extends Error {
  constructor(message: string | undefined) {
    super(message);
    this.name = "SentryExampleFrontendError";
  }
}

export default function Page() {
  const [hasSentError, setHasSentError] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  
  useEffect(() => {
    async function checkConnectivity() {
      logger.info("Checking Sentry connectivity", {
        environment: process.env.NODE_ENV,
        sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN ? "configured" : "missing"
      });
      
      try {
        const result = await Sentry.diagnoseSdkConnectivity();
        logger.info("Sentry connectivity check result", { result });
        setIsConnected(result !== 'sentry-unreachable');
      } catch (error) {
        logger.error("Failed to check Sentry connectivity", { error });
        setIsConnected(false);
      }
    }
    checkConnectivity();
  }, []);

  return (
    <div>
      <Head>
        <title>sentry-example-page</title>
        <meta name="description" content="Test Sentry for your Next.js app!" />
      </Head>

      <main className={styles.main}>
        <div className={styles.flexSpacer} />
        <svg height="40" width="40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M21.85 2.995a3.698 3.698 0 0 1 1.353 1.354l16.303 28.278a3.703 3.703 0 0 1-1.354 5.053 3.694 3.694 0 0 1-1.848.496h-3.828a31.149 31.149 0 0 0 0-3.09h3.815a.61.61 0 0 0 .537-.917L20.523 5.893a.61.61 0 0 0-1.057 0l-3.739 6.494a28.948 28.948 0 0 1 9.63 10.453 28.988 28.988 0 0 1 3.499 13.78v1.542h-9.852v-1.544a19.106 19.106 0 0 0-2.182-8.85 19.08 19.08 0 0 0-6.032-6.829l-1.85 3.208a15.377 15.377 0 0 1 6.382 12.484v1.542H3.696A3.694 3.694 0 0 1 0 34.473c0-.648.17-1.286.494-1.849l2.33-4.074a8.562 8.562 0 0 1 2.689 1.536L3.158 34.17a.611.611 0 0 0 .538.917h8.448a12.481 12.481 0 0 0-6.037-9.09l-1.344-.772 4.908-8.545 1.344.77a22.16 22.16 0 0 1 7.705 7.444 22.193 22.193 0 0 1 3.316 10.193h3.699a25.892 25.892 0 0 0-3.811-12.033 25.856 25.856 0 0 0-9.046-8.796l-1.344-.772 5.269-9.136a3.698 3.698 0 0 1 3.2-1.849c.648 0 1.285.17 1.847.495Z" fill="currentcolor"/>
        </svg>
        <h1 className={styles.title}>
          sentry-example-page
        </h1>

        <p className={styles.description}>
          Click the button below, and view the sample error on the Sentry <a target="_blank" href="https://silver-branch-labs.sentry.io/issues/?project=4510058123821056" className={styles.link}>Issues Page</a>.
          For more details about setting up Sentry, <a target="_blank"
           href="https://docs.sentry.io/platforms/javascript/guides/nextjs/" className={styles.link}>read our docs</a>.
        </p>

        <button
          type="button"
          className={styles.button}
          onClick={async () => {
            logger.info("Button clicked - starting Sentry test");
            
            try {
              await Sentry.startSpan({
                name: 'Example Frontend/Backend Span',
                op: 'test'
              }, async () => {
                logger.info("Making API call to /api/sentry-example-api");
                const res = await fetch("/api/sentry-example-api");
                logger.info("API call completed", { 
                  status: res.status, 
                  ok: res.ok,
                  statusText: res.statusText 
                });
                
                if (!res.ok) {
                  logger.warn("API call returned non-ok status", { status: res.status });
                  setHasSentError(true);
                }
              });
              
              logger.info("About to throw frontend error");
              throw new SentryExampleFrontendError("This error is raised on the frontend of the example page.");
            } catch (error) {
              logger.error("Error in button click handler", { 
                error: error instanceof Error ? error.message : String(error),
                errorName: error instanceof Error ? error.name : 'Unknown'
              });
              throw error; // Re-throw to let Sentry handle it
            }
          }}
          disabled={!isConnected}
        >
          <span>
            Throw Sample Error
          </span>
        </button>

        {hasSentError ? (
          <p className={styles.success}>
            Error sent to Sentry.
          </p>
        ) : !isConnected ? (
          <div className={styles.connectivityError}>
            <p>It looks like network requests to Sentry are being blocked, which will prevent errors from being captured. Try disabling your ad-blocker to complete the test.</p>
          </div>
        ) : (
          <div className={styles.successPlaceholder} />
        )}

        <div className={styles.flexSpacer} />
      
      </main>

    </div>
  );
}
