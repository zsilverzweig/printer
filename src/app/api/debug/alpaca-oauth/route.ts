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
      authUrl: process.env.ALPACA_AUTH_URL || "default",
      tokenUrl: process.env.ALPACA_TOKEN_URL || "default",
      appUrl: process.env.NEXT_PUBLIC_APP_URL || "missing",
    };

    // Generate test URL
    const redirectUri = `${
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
    }/api/alpaca/oauth/callback`;
    const state = "debug_test_123";

    let testAuthUrl = "Error generating URL";
    try {
      testAuthUrl = alpacaOAuthService.generateAuthUrl(
        redirectUri,
        state,
        environment || undefined
      );
    } catch (error) {
      testAuthUrl = `Error: ${
        error instanceof Error ? error.message : "Unknown error"
      }`;
    }

    return NextResponse.json({
      environment: environment || "both",
      envDebug,
      redirectUri,
      state,
      testAuthUrl,
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
