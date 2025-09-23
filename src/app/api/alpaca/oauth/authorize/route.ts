import { alpacaOAuthService } from "@/features/finance/lib/alpaca-oauth-service";
import { log } from "@/lib/utils/logger";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const environment = searchParams.get("environment") as
      | "paper"
      | "live"
      | null;

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    // Debug: Log environment variables (without exposing secrets)
    const hasClientId = !!process.env.ALPACA_CLIENT_ID;
    const hasClientSecret = !!process.env.ALPACA_CLIENT_SECRET;
    const clientIdLength = process.env.ALPACA_CLIENT_ID?.length || 0;
    const clientIdPrefix =
      process.env.ALPACA_CLIENT_ID?.substring(0, 8) || "missing";

    log.debug(
      "Environment variables check",
      {
        hasClientId,
        hasClientSecret,
        clientIdLength,
        clientIdPrefix,
        environment: environment || "both",
        redirectUri: `${process.env.NEXT_PUBLIC_APP_URL}/api/alpaca/oauth/callback`,
      },
      "AlpacaOAuth"
    );

    // Generate state parameter for security (should match user session)
    const state = `${userId}_${Date.now()}`;

    // Get the redirect URI from the request or use a default
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/alpaca/oauth/callback`;

    // Generate the authorization URL with environment support
    const authUrl = alpacaOAuthService.generateAuthUrl(
      redirectUri,
      state,
      environment || undefined
    );

    log.debug(
      "Generated Alpaca OAuth authorization URL",
      { userId, state, redirectUri, environment: environment || "both" },
      "AlpacaOAuth"
    );

    return NextResponse.json({
      authUrl,
      state,
      environment: environment || "both",
    });
  } catch (error) {
    log.failure(
      "Failed to generate authorization URL",
      { error: error instanceof Error ? error.message : "Unknown error" },
      "AlpacaOAuth"
    );

    return NextResponse.json(
      { error: "Failed to generate authorization URL" },
      { status: 500 }
    );
  }
}
