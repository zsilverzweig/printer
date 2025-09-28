"use client";

import { useState } from "react";

import { Badge } from "@/lib/components/ui/badge";
import { Button } from "@/lib/components/ui/button";
import { Card } from "@/lib/components/ui/card";
import { Input } from "@/lib/components/ui/input";
import { Label } from "@/lib/components/ui/label";
import { Separator } from "@/lib/components/ui/separator";
import { Textarea } from "@/lib/components/ui/textarea";

interface TestResult {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
}

export function AlpacaOAuthTester() {
  const [results, setResults] = useState<Record<string, TestResult>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  // Form state
  const [formData, setFormData] = useState({
    code: "",
    redirectUri: `${
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
    }/api/alpaca/oauth/callback`,
    accessToken: "",
    refreshToken: "",
  });

  const runTest = async (
    testName: string,
    testFunction: () => Promise<any>
  ) => {
    setLoading((prev) => ({ ...prev, [testName]: true }));
    try {
      const result = await testFunction();
      setResults((prev) => ({
        ...prev,
        [testName]: { success: true, message: "Test passed", data: result },
      }));
    } catch (error) {
      setResults((prev) => ({
        ...prev,
        [testName]: {
          success: false,
          message: "Test failed",
          error: error instanceof Error ? error.message : "Unknown error",
        },
      }));
    } finally {
      setLoading((prev) => ({ ...prev, [testName]: false }));
    }
  };

  const testTokenExchange = async () => {
    const response = await fetch("/api/debug/alpaca-token-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        testType: "exchange_code",
        code: formData.code,
        redirectUri: formData.redirectUri,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  };

  const testTokenRefresh = async () => {
    const response = await fetch("/api/debug/alpaca-token-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        testType: "refresh_token",
        refreshToken: formData.refreshToken,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  };

  const testUserInfo = async () => {
    const response = await fetch("/api/debug/alpaca-token-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        testType: "get_user_info",
        accessToken: formData.accessToken,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  };

  const testTokenRevocation = async () => {
    const response = await fetch("/api/debug/alpaca-token-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        testType: "revoke_token",
        accessToken: formData.accessToken,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  };

  const TestCard = ({
    title,
    description,
    testName,
    testFunction,
    children,
  }: {
    title: string;
    description: string;
    testName: string;
    testFunction: () => Promise<any>;
    children?: React.ReactNode;
  }) => {
    const result = results[testName];
    const isLoading = loading[testName];

    return (
      <Card className="p-6">
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold">{title}</h3>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>

          {children}

          <Button
            onClick={() => runTest(testName, testFunction)}
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? "Running..." : `Run ${title}`}
          </Button>

          {result && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant={result.success ? "default" : "destructive"}>
                  {result.success ? "PASS" : "FAIL"}
                </Badge>
                <span className="text-sm">{result.message}</span>
              </div>

              {result.error && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                  <p className="text-sm text-destructive font-mono">
                    {result.error}
                  </p>
                </div>
              )}

              {result.data && (
                <div className="p-3 bg-muted border rounded-md">
                  <pre className="text-xs overflow-auto max-h-64">
                    {JSON.stringify(result.data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Alpaca OAuth Token Tester</h2>
        <p className="text-muted-foreground">
          Test OAuth token operations with real tokens (use with caution)
        </p>
      </div>

      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Token Input Form</h3>
        <div className="space-y-4">
          <div>
            <Label htmlFor="code">Authorization Code</Label>
            <Input
              id="code"
              type="text"
              placeholder="Enter authorization code from OAuth callback"
              value={formData.code}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, code: e.target.value }))
              }
            />
          </div>

          <div>
            <Label htmlFor="redirectUri">Redirect URI</Label>
            <Input
              id="redirectUri"
              type="text"
              value={formData.redirectUri}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  redirectUri: e.target.value,
                }))
              }
            />
          </div>

          <div>
            <Label htmlFor="accessToken">Access Token</Label>
            <Textarea
              id="accessToken"
              placeholder="Enter access token"
              value={formData.accessToken}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  accessToken: e.target.value,
                }))
              }
              rows={3}
            />
          </div>

          <div>
            <Label htmlFor="refreshToken">Refresh Token</Label>
            <Textarea
              id="refreshToken"
              placeholder="Enter refresh token"
              value={formData.refreshToken}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  refreshToken: e.target.value,
                }))
              }
              rows={3}
            />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <TestCard
          title="Token Exchange"
          description="Exchange authorization code for access token"
          testName="token-exchange"
          testFunction={testTokenExchange}
        >
          <div className="text-xs text-muted-foreground">
            Requires: Authorization code and redirect URI
          </div>
        </TestCard>

        <TestCard
          title="Token Refresh"
          description="Refresh access token using refresh token"
          testName="token-refresh"
          testFunction={testTokenRefresh}
        >
          <div className="text-xs text-muted-foreground">
            Requires: Refresh token
          </div>
        </TestCard>

        <TestCard
          title="User Info"
          description="Get user information using access token"
          testName="user-info"
          testFunction={testUserInfo}
        >
          <div className="text-xs text-muted-foreground">
            Requires: Access token
          </div>
        </TestCard>

        <TestCard
          title="Token Revocation"
          description="Revoke access token"
          testName="token-revocation"
          testFunction={testTokenRevocation}
        >
          <div className="text-xs text-muted-foreground">
            Requires: Access token (⚠️ This will invalidate the token)
          </div>
        </TestCard>
      </div>

      <Separator />

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Quick Actions</h3>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setResults({});
              setLoading({});
            }}
          >
            Clear Results
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setFormData({
                code: "",
                redirectUri: `${
                  process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
                }/api/alpaca/oauth/callback`,
                accessToken: "",
                refreshToken: "",
              });
            }}
          >
            Clear Form
          </Button>
        </div>
      </div>

      <Card className="p-4 bg-yellow-50 border-yellow-200">
        <div className="space-y-2 text-sm">
          <p className="font-semibold text-yellow-800">⚠️ Security Warning</p>
          <p className="text-yellow-700">
            This tool is for debugging purposes only. Never use it in production
            or with real user tokens. Tokens entered here may be logged or
            stored temporarily for debugging purposes.
          </p>
        </div>
      </Card>
    </div>
  );
}
