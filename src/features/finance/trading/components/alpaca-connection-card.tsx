"use client";

import { AlertCircle, CheckCircle, ExternalLink, Loader2 } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";

import { useAlpacaOAuth } from "../hooks/use-alpaca-oauth";

export function AlpacaConnectionCard() {
  const {
    isConnected,
    isLoading,
    error,
    alpacaUserId,
    alpacaEmail,
    connectAccount,
    disconnectAccount,
    checkConnectionStatus,
  } = useAlpacaOAuth();

  // Check connection status on mount
  useEffect(() => {
    checkConnectionStatus();
  }, [checkConnectionStatus]);

  const handleConnect = (environment?: "paper" | "live") => {
    connectAccount(environment);
  };

  const handleDisconnect = () => {
    if (
      confirm(
        "Are you sure you want to disconnect your Alpaca account? This will revoke access to your trading data."
      )
    ) {
      disconnectAccount();
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <span>Alpaca Trading Account</span>
              {isConnected && (
                <CheckCircle className="h-5 w-5 text-green-600" />
              )}
              {error && <AlertCircle className="h-5 w-5 text-red-600" />}
            </CardTitle>
            <CardDescription>
              {isConnected
                ? "Your Alpaca account is connected and ready for trading"
                : "Connect your Alpaca account to enable automated trading"}
            </CardDescription>
          </div>
          {isLoading && <Loader2 className="h-5 w-5 animate-spin" />}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-md bg-red-50 p-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          </div>
        )}

        {isConnected ? (
          <div className="space-y-3">
            <div className="rounded-md bg-green-50 p-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <p className="text-sm text-green-800">Account Connected</p>
              </div>
            </div>

            {alpacaEmail && (
              <div className="text-sm text-muted-foreground">
                <strong>Email:</strong> {alpacaEmail}
              </div>
            )}

            {alpacaUserId && (
              <div className="text-sm text-muted-foreground">
                <strong>Account ID:</strong> {alpacaUserId}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={handleDisconnect}
                variant="outline"
                size="sm"
                disabled={isLoading}
              >
                Disconnect Account
              </Button>
              <Button
                onClick={() =>
                  window.open("https://app.alpaca.markets/", "_blank")
                }
                variant="outline"
                size="sm"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open Alpaca Dashboard
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Connect your Alpaca account to enable:
            </div>
            <ul className="text-sm text-muted-foreground space-y-1 ml-4">
              <li>• Automated portfolio management</li>
              <li>• Paper and live trading execution</li>
              <li>• Real-time account monitoring</li>
              <li>• Position tracking and analysis</li>
            </ul>

            <div className="space-y-3">
              <div className="flex gap-2">
                <Button
                  onClick={() => handleConnect()}
                  disabled={isLoading}
                  size="sm"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Connect Both Accounts
                    </>
                  )}
                </Button>

                <Button
                  onClick={() =>
                    window.open("https://alpaca.markets/", "_blank")
                  }
                  variant="outline"
                  size="sm"
                >
                  Learn More
                </Button>
              </div>

              <div className="text-xs text-muted-foreground">
                Or connect specific account types:
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={() => handleConnect("paper")}
                  disabled={isLoading}
                  variant="outline"
                  size="sm"
                >
                  Paper Trading Only
                </Button>
                <Button
                  onClick={() => handleConnect("live")}
                  disabled={isLoading}
                  variant="outline"
                  size="sm"
                >
                  Live Trading Only
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
