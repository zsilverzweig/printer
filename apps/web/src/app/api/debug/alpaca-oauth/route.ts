import { NextRequest, NextResponse } from "next/server";

import { alpacaOAuthService } from "@/features/finance/lib/alpaca-oauth-service";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const environment = searchParams.get("environment") as
      | "paper"
      | "live"
      | null;

    // Debug environment variables (safe to expose)
    const envDebug = {
      hasClientId: !!process.env.ALPACA_CLIENT_ID,
      hasClientSecret: !!process.env.ALPACA_CLIENT_SECRET,
      clientIdLength: process.env.ALPACA_CLIENT_ID?.length || 0,
      clientIdPrefix:
        process.env.ALPACA_CLIENT_ID?.substring(0, 10) || "missing",
      clientIdSuffix: process.env.ALPACA_CLIENT_ID?.substring(-10) || "missing",
      authUrl: process.env.ALPACA_AUTH_URL || "default",
      tokenUrl: process.env.ALPACA_TOKEN_URL || "default",
      apiBaseUrl: process.env.ALPACA_API_BASE_URL || "default",
      paperApiBaseUrl: process.env.ALPACA_PAPER_API_BASE_URL || "default",
      appUrl: process.env.NEXT_PUBLIC_APP_URL || "missing",
      nodeEnv: process.env.NODE_ENV || "missing",
    };

    // Generate test URL
    const redirectUri = `${
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
    }/api/alpaca/oauth/callback`;

    // Validate environment configuration
    const validation = {
      hasRequiredEnvVars: !!(
        process.env.ALPACA_CLIENT_ID && process.env.ALPACA_CLIENT_SECRET
      ),
      hasAppUrl: !!process.env.NEXT_PUBLIC_APP_URL,
      hasAuthUrl: !!process.env.ALPACA_AUTH_URL,
      hasTokenUrl: !!process.env.ALPACA_TOKEN_URL,
      isProduction: process.env.NODE_ENV === "production",
    };

    // Redirect URI validation
    const redirectUriValidation = {
      expectedRedirectUri: redirectUri,
      hasTrailingSlash: redirectUri.endsWith("/"),
      isLocalhost: redirectUri.includes("localhost"),
      isHttps: redirectUri.startsWith("https://"),
      isHttp: redirectUri.startsWith("http://"),
    };
    const state = "debug_test_123";

    let testAuthUrl = "Error generating URL";
    let urlGenerationError = null;
    try {
      testAuthUrl = alpacaOAuthService.generateAuthUrl(
        redirectUri,
        state,
        environment || undefined
      );
    } catch (error) {
      urlGenerationError =
        error instanceof Error ? error.message : "Unknown error";
      testAuthUrl = `Error: ${urlGenerationError}`;
    }

    // Test API connectivity (basic check)
    const connectivityTests = [];
    const endpoints = [
      { name: "Live API Clock", url: "https://api.alpaca.markets/v2/clock" },
      {
        name: "Paper API Clock",
        url: "https://paper-api.alpaca.markets/v2/clock",
      },
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint.url, {
          method: "GET",
          headers: { Accept: "application/json" },
        });
        connectivityTests.push({
          name: endpoint.name,
          url: endpoint.url,
          status: response.status,
          success: response.ok,
          reachable: true,
          error: response.ok ? null : `HTTP ${response.status}`,
        });
      } catch (error) {
        connectivityTests.push({
          name: endpoint.name,
          url: endpoint.url,
          status: 0,
          success: false,
          reachable: false,
          error: error instanceof Error ? error.message : "Network error",
        });
      }
    }

    return NextResponse.json({
      environment: environment || "both",
      envDebug,
      validation,
      redirectUriValidation,
      redirectUri,
      state,
      testAuthUrl,
      urlGenerationError,
      connectivityTests,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
