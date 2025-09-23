"use client";

import { AlertCircle, ArrowLeft, ExternalLink, RefreshCw } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";

export default function OAuthErrorPage() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const errorParam = searchParams.get("error");
    const messageParam = searchParams.get("message");
    
    setError(errorParam);
    setMessage(messageParam);
  }, [searchParams]);

  const getErrorTitle = (errorType: string | null) => {
    switch (errorType) {
      case "oauth_callback_failed":
        return "Connection Failed";
      case "access_denied":
        return "Access Denied";
      case "invalid_request":
        return "Invalid Request";
      case "server_error":
        return "Server Error";
      default:
        return "Connection Error";
    }
  };

  const getErrorDescription = (errorType: string | null) => {
    switch (errorType) {
      case "oauth_callback_failed":
        return "We couldn't complete the connection to your trading account. This might be due to network issues or temporary service problems.";
      case "access_denied":
        return "You denied access to your trading account. You can try connecting again if you change your mind.";
      case "invalid_request":
        return "The connection request was invalid. Please try connecting again.";
      case "server_error":
        return "There was a server error during the connection process. Please try again in a few moments.";
      default:
        return "An unexpected error occurred while connecting your trading account.";
    }
  };

  const getSuggestedActions = (errorType: string | null) => {
    switch (errorType) {
      case "oauth_callback_failed":
        return [
          "Check your internet connection",
          "Verify your trading account credentials",
          "Try connecting again in a few minutes",
          "Contact support if the problem persists"
        ];
      case "access_denied":
        return [
          "Review the permissions we're requesting",
          "Make sure you're comfortable with the access level",
          "Try connecting again when ready"
        ];
      case "invalid_request":
        return [
          "Make sure you're using the correct connection link",
          "Try refreshing the page and connecting again",
          "Clear your browser cache if needed"
        ];
      case "server_error":
        return [
          "Wait a few minutes and try again",
          "Check if there are any service outages",
          "Contact support if the error continues"
        ];
      default:
        return [
          "Try connecting again",
          "Check your internet connection",
          "Contact support if the problem persists"
        ];
    }
  };

  const handleRetryConnection = () => {
    // Redirect back to profile page to retry connection
    window.location.href = "/profile";
  };

  const handleGoToTrading = () => {
    // Go to trading page to see current status
    window.location.href = "/trading";
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle className="text-2xl">
              {getErrorTitle(error)}
            </CardTitle>
            <CardDescription className="text-base">
              {getErrorDescription(error)}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {message && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-destructive">
                      Error Details
                    </p>
                    <p className="text-sm text-destructive/80 mt-1">
                      {decodeURIComponent(message)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <h3 className="text-lg font-medium">What you can do:</h3>
              <ul className="space-y-2">
                {getSuggestedActions(error).map((action, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground mt-2 flex-shrink-0" />
                    <span className="text-sm text-muted-foreground">{action}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button 
                onClick={handleRetryConnection}
                className="flex-1"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Try Again
              </Button>
              <Button 
                onClick={handleGoToTrading}
                variant="outline"
                className="flex-1"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Trading
              </Button>
            </div>

            <div className="pt-4 border-t">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-3">
                  Need help? Check our documentation or contact support.
                </p>
                <div className="flex justify-center gap-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open("https://docs.alpaca.markets/", "_blank")}
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Alpaca Docs
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open("mailto:support@printer.com", "_blank")}
                  >
                    Contact Support
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
