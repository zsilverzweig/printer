import { alpacaOAuthService } from "@/features/finance/lib/alpaca-oauth-service";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { testType, code, redirectUri, accessToken, refreshToken } = body;

    switch (testType) {
      case "exchange_code":
        if (!code || !redirectUri) {
          return NextResponse.json(
            {
              error:
                "code and redirectUri are required for token exchange test",
            },
            { status: 400 }
          );
        }

        try {
          const tokens = await alpacaOAuthService.exchangeCodeForToken(
            code,
            redirectUri
          );
          return NextResponse.json({
            success: true,
            message: "Token exchange successful",
            data: {
              token_type: tokens.token_type,
              expires_in: tokens.expires_in,
              scope: tokens.scope,
              has_refresh_token: !!tokens.refresh_token,
              // Don't expose actual tokens in debug output
              access_token_preview:
                tokens.access_token.substring(0, 10) + "...",
              refresh_token_preview:
                tokens.refresh_token?.substring(0, 10) + "..." || "none",
            },
          });
        } catch (error) {
          return NextResponse.json({
            success: false,
            message: "Token exchange failed",
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }

      case "refresh_token":
        if (!refreshToken) {
          return NextResponse.json(
            { error: "refreshToken is required for refresh test" },
            { status: 400 }
          );
        }

        try {
          const tokens = await alpacaOAuthService.refreshAccessToken(
            refreshToken
          );
          return NextResponse.json({
            success: true,
            message: "Token refresh successful",
            data: {
              token_type: tokens.token_type,
              expires_in: tokens.expires_in,
              scope: tokens.scope,
              has_refresh_token: !!tokens.refresh_token,
              access_token_preview:
                tokens.access_token.substring(0, 10) + "...",
              refresh_token_preview:
                tokens.refresh_token?.substring(0, 10) + "..." || "none",
            },
          });
        } catch (error) {
          return NextResponse.json({
            success: false,
            message: "Token refresh failed",
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }

      case "get_user_info":
        if (!accessToken) {
          return NextResponse.json(
            { error: "accessToken is required for user info test" },
            { status: 400 }
          );
        }

        try {
          const userInfo = await alpacaOAuthService.getUserInfo(accessToken);
          return NextResponse.json({
            success: true,
            message: "User info retrieval successful",
            data: userInfo,
          });
        } catch (error) {
          return NextResponse.json({
            success: false,
            message: "User info retrieval failed",
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }

      case "revoke_token":
        if (!accessToken) {
          return NextResponse.json(
            { error: "accessToken is required for token revocation test" },
            { status: 400 }
          );
        }

        try {
          await alpacaOAuthService.revokeToken(accessToken);
          return NextResponse.json({
            success: true,
            message: "Token revocation successful",
          });
        } catch (error) {
          return NextResponse.json({
            success: false,
            message: "Token revocation failed",
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }

      default:
        return NextResponse.json(
          {
            error:
              "Invalid test type. Supported types: exchange_code, refresh_token, get_user_info, revoke_token",
          },
          { status: 400 }
        );
    }
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

export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: "Alpaca Token Test API",
    description: "Use POST method to test token operations",
    supportedTests: [
      {
        type: "exchange_code",
        description: "Test exchanging authorization code for access token",
        requiredFields: ["code", "redirectUri"],
      },
      {
        type: "refresh_token",
        description: "Test refreshing access token using refresh token",
        requiredFields: ["refreshToken"],
      },
      {
        type: "get_user_info",
        description: "Test getting user information using access token",
        requiredFields: ["accessToken"],
      },
      {
        type: "revoke_token",
        description: "Test revoking access token",
        requiredFields: ["accessToken"],
      },
    ],
    example: {
      method: "POST",
      body: {
        testType: "get_user_info",
        accessToken: "your_access_token_here",
      },
    },
  });
}
