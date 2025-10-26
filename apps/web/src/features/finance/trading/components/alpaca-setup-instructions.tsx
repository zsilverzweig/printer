"use client";

import { AlertCircle, ExternalLink, Copy } from "lucide-react";

import { Button } from "@/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";

export function AlpacaSetupInstructions() {
  const envVars = [
    "ALPACA_CLIENT_ID=your_client_id_here",
    "ALPACA_CLIENT_SECRET=your_client_secret_here",
    "ALPACA_AUTH_URL=https://app.alpaca.markets/oauth/authorize",
    "ALPACA_TOKEN_URL=https://api.alpaca.markets/oauth/token",
    "ALPACA_API_BASE_URL=https://api.alpaca.markets",
  ];

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <Card className="border-orange-200 bg-orange-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-orange-800">
          <AlertCircle className="h-5 w-5" />
          Alpaca OAuth Setup Required
        </CardTitle>
        <CardDescription className="text-orange-700">
          To connect Alpaca accounts, you need to configure OAuth credentials
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <div>
            <h4 className="font-medium text-orange-800 mb-2">Step 1: Create OAuth App</h4>
            <p className="text-sm text-orange-700 mb-2">
              Go to Alpaca Markets and create an OAuth application:
            </p>
            <Button
              onClick={() => window.open("https://alpaca.markets/apps", "_blank")}
              variant="outline"
              size="sm"
              className="border-orange-300 text-orange-700 hover:bg-orange-100"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Open Alpaca Apps
            </Button>
          </div>

          <div>
            <h4 className="font-medium text-orange-800 mb-2">Step 2: Set Redirect URI</h4>
            <p className="text-sm text-orange-700 mb-2">
              In your OAuth app settings, set the redirect URI to:
            </p>
            <div className="flex items-center gap-2 p-2 bg-orange-100 rounded border border-orange-200">
              <code className="text-sm text-orange-800 flex-1">
                {process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/alpaca/oauth/callback
              </code>
              <Button
                onClick={() => copyToClipboard(
                  `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/alpaca/oauth/callback`
                )}
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>

          <div>
            <h4 className="font-medium text-orange-800 mb-2">Step 3: Add Environment Variables</h4>
            <p className="text-sm text-orange-700 mb-2">
              Add these variables to your <code>.env.local</code> file:
            </p>
            <div className="space-y-1">
              {envVars.map((envVar, index) => (
                <div key={index} className="flex items-center gap-2 p-2 bg-orange-100 rounded border border-orange-200">
                  <code className="text-sm text-orange-800 flex-1">{envVar}</code>
                  <Button
                    onClick={() => copyToClipboard(envVar)}
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="font-medium text-orange-800 mb-2">Step 4: Restart Development Server</h4>
            <p className="text-sm text-orange-700">
              After adding the environment variables, restart your development server:
            </p>
            <div className="flex items-center gap-2 p-2 bg-orange-100 rounded border border-orange-200 mt-2">
              <code className="text-sm text-orange-800 flex-1">npm run dev</code>
              <Button
                onClick={() => copyToClipboard("npm run dev")}
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
