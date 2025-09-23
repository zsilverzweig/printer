import { alpacaOAuthService } from "@/features/finance/lib/alpaca-oauth-service";
import { log } from "@/lib/utils/logger";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    // Handle OAuth error
    if (error) {
      log.failure(
        "OAuth authorization failed",
        { error, state },
        "AlpacaOAuth"
      );

      return NextResponse.redirect(
        `${
          process.env.NEXT_PUBLIC_APP_URL
        }/portfolios?error=oauth_failed&message=${encodeURIComponent(error)}`
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
        `${process.env.NEXT_PUBLIC_APP_URL}/portfolios?error=missing_parameters`
      );
    }

    // Extract userId from state (format: userId_timestamp)
    const userId = state.split("_")[0];
    if (!userId) {
      log.failure("Invalid state parameter", { state }, "AlpacaOAuth");

      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/portfolios?error=invalid_state`
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

    // TODO: Store tokens and user info in your database
    // This is where you would save the OAuth tokens to associate with the user
    // For now, we'll just log the success and redirect

    log.success(
      "Successfully connected Alpaca account",
      {
        userId,
        alpacaUserId: userInfo.id,
        status: userInfo.status,
      },
      "AlpacaOAuth"
    );

    // Redirect to portfolios page with success message
    return NextResponse.redirect(
      `${
        process.env.NEXT_PUBLIC_APP_URL
      }/portfolios?success=alpaca_connected&message=${encodeURIComponent(
        `Connected to Alpaca account: ${userInfo.email}`
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
      }/portfolios?error=oauth_callback_failed&message=${encodeURIComponent(
        "Failed to connect Alpaca account"
      )}`
    );
  }
}
