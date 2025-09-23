import { NextRequest, NextResponse } from "next/server";

import { alpacaOAuthService } from "@/features/finance/lib/alpaca-oauth-service";
import { log } from "@/lib/utils/logger";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const testType = searchParams.get("test") || "auth_url";

    log.info(
      "🧪 OAuth2 Verbose Test Started",
      {
        testType,
        url: request.url,
        timestamp: new Date().toISOString(),
        environment: {
          hasClientId: !!process.env.ALPACA_CLIENT_ID,
          hasClientSecret: !!process.env.ALPACA_CLIENT_SECRET,
          clientIdLength: process.env.ALPACA_CLIENT_ID?.length || 0,
          clientIdPrefix:
            process.env.ALPACA_CLIENT_ID?.substring(0, 10) || "missing",
          authUrl: process.env.ALPACA_AUTH_URL || "default",
          tokenUrl: process.env.ALPACA_TOKEN_URL || "default",
          appUrl: process.env.NEXT_PUBLIC_APP_URL || "missing",
        },
      },
      "OAuthVerboseTest"
    );

    if (testType === "auth_url") {
      // Test authorization URL generation
      const redirectUri = "http://localhost:3000/api/alpaca/oauth/callback";
      const state = `verbose_test_${Date.now()}`;

      const authUrl = alpacaOAuthService.generateAuthUrl(
        redirectUri,
        state,
        "paper"
      );

      return NextResponse.json({
        success: true,
        testType: "auth_url",
        authUrl,
        redirectUri,
        state,
        environment: "paper",
        timestamp: new Date().toISOString(),
        message:
          "Authorization URL generated successfully. Check server logs for detailed OAuth2 flow information.",
      });
    }

    if (testType === "token_exchange") {
      const code = searchParams.get("code");
      const redirectUri =
        searchParams.get("redirect_uri") ||
        "http://localhost:3000/api/alpaca/oauth/callback";

      if (!code) {
        return NextResponse.json(
          {
            success: false,
            error: "Authorization code is required for token exchange test",
            usage:
              "Add ?test=token_exchange&code=YOUR_AUTH_CODE&redirect_uri=YOUR_REDIRECT_URI",
          },
          { status: 400 }
        );
      }

      // Test token exchange
      const tokens = await alpacaOAuthService.exchangeCodeForToken(
        code,
        redirectUri
      );

      return NextResponse.json({
        success: true,
        testType: "token_exchange",
        tokens: {
          token_type: tokens.token_type,
          scope: tokens.scope,
          expires_in: tokens.expires_in,
          has_refresh_token: !!tokens.refresh_token,
          access_token_preview: tokens.access_token.substring(0, 10) + "...",
          refresh_token_preview:
            tokens.refresh_token?.substring(0, 10) + "..." || "none",
        },
        timestamp: new Date().toISOString(),
        message:
          "Token exchange completed successfully. Check server logs for detailed OAuth2 flow information.",
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: "Invalid test type",
        availableTests: [
          "auth_url - Test authorization URL generation",
          "token_exchange - Test token exchange (requires code parameter)",
        ],
      },
      { status: 400 }
    );
  } catch (error) {
    log.failure(
      "💥 OAuth2 Verbose Test Failed",
      {
        error: error instanceof Error ? error.message : "Unknown error",
        errorStack: error instanceof Error ? error.stack : undefined,
        url: request.url,
        timestamp: new Date().toISOString(),
      },
      "OAuthVerboseTest"
    );

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
