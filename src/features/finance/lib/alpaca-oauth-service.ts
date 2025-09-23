import { log } from "@/lib/utils/logger";

export interface AlpacaOAuthTokens {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

export interface AlpacaUserInfo {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  status: string;
}

class AlpacaOAuthService {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly authUrl: string;
  private readonly tokenUrl: string;
  private readonly apiBaseUrl: string;

  constructor() {
    this.clientId = process.env.ALPACA_CLIENT_ID || "";
    this.clientSecret = process.env.ALPACA_CLIENT_SECRET || "";
    this.authUrl =
      process.env.ALPACA_AUTH_URL ||
      "https://app.alpaca.markets/oauth/authorize";
    this.tokenUrl =
      process.env.ALPACA_TOKEN_URL || "https://api.alpaca.markets/oauth/token";
    this.apiBaseUrl =
      process.env.ALPACA_API_BASE_URL || "https://api.alpaca.markets";

    if (!this.clientId || !this.clientSecret) {
      log.failure(
        "Alpaca OAuth credentials are not configured",
        {
          hasClientId: !!this.clientId,
          hasClientSecret: !!this.clientSecret,
        },
        "AlpacaOAuthService"
      );
    }
  }

  private ensureCredentials(): void {
    if (!this.clientId || !this.clientSecret) {
      throw new Error(
        "Alpaca OAuth credentials are not configured. Please set ALPACA_CLIENT_ID and ALPACA_CLIENT_SECRET environment variables."
      );
    }
  }

  /**
   * Generate the OAuth2 authorization URL for users to connect their Alpaca account
   */
  generateAuthUrl(
    redirectUri: string,
    state?: string,
    environment?: "paper" | "live"
  ): string {
    this.ensureCredentials();

    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      scope: "trading:read trading:write account:read", // Request trading and account access
    });

    // Add environment parameter if specified
    if (environment) {
      params.set("env", environment);
    }
    // If no environment specified, user can authorize both paper and live accounts

    if (state) {
      params.set("state", state);
    }

    const authUrl = `${this.authUrl}?${params.toString()}`;

    log.debug(
      "Generated OAuth authorization URL",
      {
        environment: environment || "both",
        clientId: this.clientId.substring(0, 8) + "...",
        redirectUri,
        hasState: !!state,
      },
      "AlpacaOAuthService"
    );

    return authUrl;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(
    code: string,
    redirectUri: string
  ): Promise<AlpacaOAuthTokens> {
    this.ensureCredentials();
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
      redirect_uri: redirectUri,
    });

    log.debug(
      "Exchanging authorization code for token",
      { code: code.substring(0, 10) + "..." },
      "AlpacaOAuthService"
    );

    try {
      const response = await fetch(this.tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Token exchange failed: ${response.status} ${errorText}`
        );
      }

      const tokens = (await response.json()) as AlpacaOAuthTokens;

      log.success(
        "Successfully exchanged code for tokens",
        { token_type: tokens.token_type, scope: tokens.scope },
        "AlpacaOAuthService"
      );

      return tokens;
    } catch (error) {
      log.failure(
        "Failed to exchange authorization code for token",
        { error: error instanceof Error ? error.message : "Unknown error" },
        "AlpacaOAuthService"
      );
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<AlpacaOAuthTokens> {
    this.ensureCredentials();
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: refreshToken,
    });

    log.debug(
      "Refreshing access token",
      { refreshToken: refreshToken.substring(0, 10) + "..." },
      "AlpacaOAuthService"
    );

    try {
      const response = await fetch(this.tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Token refresh failed: ${response.status} ${errorText}`
        );
      }

      const tokens = (await response.json()) as AlpacaOAuthTokens;

      log.success(
        "Successfully refreshed access token",
        { token_type: tokens.token_type },
        "AlpacaOAuthService"
      );

      return tokens;
    } catch (error) {
      log.failure(
        "Failed to refresh access token",
        { error: error instanceof Error ? error.message : "Unknown error" },
        "AlpacaOAuthService"
      );
      throw error;
    }
  }

  /**
   * Get user information using access token
   */
  async getUserInfo(accessToken: string): Promise<AlpacaUserInfo> {
    log.debug(
      "Fetching user info from Alpaca",
      { accessToken: accessToken.substring(0, 10) + "..." },
      "AlpacaOAuthService"
    );

    try {
      const response = await fetch(`${this.apiBaseUrl}/v2/account`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to fetch user info: ${response.status} ${errorText}`
        );
      }

      const userInfo = (await response.json()) as AlpacaUserInfo;

      log.success(
        "Successfully fetched user info",
        { userId: userInfo.id, status: userInfo.status },
        "AlpacaOAuthService"
      );

      return userInfo;
    } catch (error) {
      log.failure(
        "Failed to fetch user info",
        { error: error instanceof Error ? error.message : "Unknown error" },
        "AlpacaOAuthService"
      );
      throw error;
    }
  }

  /**
   * Revoke access token
   */
  async revokeToken(accessToken: string): Promise<void> {
    this.ensureCredentials();
    const body = new URLSearchParams({
      token: accessToken,
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });

    log.debug(
      "Revoking access token",
      { accessToken: accessToken.substring(0, 10) + "..." },
      "AlpacaOAuthService"
    );

    try {
      const response = await fetch(`${this.tokenUrl}/revoke`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Token revocation failed: ${response.status} ${errorText}`
        );
      }

      log.success(
        "Successfully revoked access token",
        {},
        "AlpacaOAuthService"
      );
    } catch (error) {
      log.failure(
        "Failed to revoke access token",
        { error: error instanceof Error ? error.message : "Unknown error" },
        "AlpacaOAuthService"
      );
      throw error;
    }
  }
}

export const alpacaOAuthService = new AlpacaOAuthService();
export default alpacaOAuthService;
