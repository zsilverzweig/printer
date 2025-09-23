import { alpacaOAuthService } from "@/features/finance/lib/alpaca-oauth-service";
import { userService } from "@/lib/services/user-service";
import { log } from "@/lib/utils/logger";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    // Verbose OAuth2 callback logging
    log.info(
      "🔔 OAuth2 Callback Received",
      {
        url: request.url,
        code: code ? code.substring(0, 10) + "..." : "missing",
        codeLength: code?.length || 0,
        state: state ? state.substring(0, 10) + "..." : "missing",
        error: error || "none",
        allParams: Object.fromEntries(searchParams.entries()),
        userAgent: request.headers.get("user-agent"),
        referer: request.headers.get("referer"),
        timestamp: new Date().toISOString(),
      },
      "AlpacaOAuth"
    );

    // Handle OAuth error
    if (error) {
      log.failure(
        "❌ OAuth authorization failed",
        {
          error,
          state,
          fullUrl: request.url,
          timestamp: new Date().toISOString(),
        },
        "AlpacaOAuth"
      );

      return NextResponse.redirect(
        `${
          process.env.NEXT_PUBLIC_APP_URL
        }/oauth-error?error=oauth_failed&message=${encodeURIComponent(error)}`
      );
    }

    // Validate required parameters
    if (!code || !state) {
      log.failure(
        "Missing required OAuth parameters",
        { code: !!code, state: !!state },
        "AlpacaOAuth"
      );

      return NextResponse.redirect(
        `${
          process.env.NEXT_PUBLIC_APP_URL
        }/oauth-error?error=missing_parameters&message=${encodeURIComponent(
          "Missing required OAuth parameters"
        )}`
      );
    }

    // Extract userId from state (format: userId_timestamp)
    const userId = state.split("_")[0];
    if (!userId) {
      log.failure("Invalid state parameter", { state }, "AlpacaOAuth");

      return NextResponse.redirect(
        `${
          process.env.NEXT_PUBLIC_APP_URL
        }/oauth-error?error=invalid_state&message=${encodeURIComponent(
          "Invalid state parameter"
        )}`
      );
    }

    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/alpaca/oauth/callback`;

    log.debug(
      "Processing OAuth callback",
      { userId, code: code.substring(0, 10) + "...", state },
      "AlpacaOAuth"
    );

    // Exchange code for tokens
    const tokens = await alpacaOAuthService.exchangeCodeForToken(
      code,
      redirectUri
    );

    // Get user information
    const userInfo = await alpacaOAuthService.getUserInfo(tokens.access_token);

    // Store Alpaca connection data in user profile
    const alpacaConnection = {
      alpacaUserId: userInfo.id,
      accessToken: tokens.access_token,
      tokenType: tokens.token_type,
      scope: tokens.scope,
      connectedAt: new Date(),
      status: "active" as const,
    };

    await userService.updateUserProfile(userId, {
      alpacaConnection,
    });

    log.success(
      "Successfully connected Alpaca account",
      {
        userId,
        alpacaUserId: userInfo.id,
        status: userInfo.status,
      },
      "AlpacaOAuth"
    );

    // Redirect to trading page with success message
    return NextResponse.redirect(
      `${
        process.env.NEXT_PUBLIC_APP_URL
      }/trading?success=alpaca_connected&message=${encodeURIComponent(
        `Successfully connected to Alpaca account (ID: ${userInfo.id})`
      )}`
    );
  } catch (error) {
    log.failure(
      "OAuth callback processing failed",
      { error: error instanceof Error ? error.message : "Unknown error" },
      "AlpacaOAuth"
    );

    return NextResponse.redirect(
      `${
        process.env.NEXT_PUBLIC_APP_URL
      }/oauth-error?error=oauth_callback_failed&message=${encodeURIComponent(
        "Failed to connect Alpaca account"
      )}`
    );
  }
}
