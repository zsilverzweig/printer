"use client";

import { useState } from "react";

import { AlpacaOAuthTester } from "@/features/admin/components/alpaca-oauth-tester";
import { Badge } from "@/lib/components/ui/badge";
import { Button } from "@/lib/components/ui/button";
import { Card } from "@/lib/components/ui/card";
import { Separator } from "@/lib/components/ui/separator";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/lib/components/ui/tabs";

interface TestResult {
  success: boolean;
  message: string;
  data?: unknown;
  error?: string;
}

export default function AlpacaDebugPage() {
  const [results, setResults] = useState<Record<string, TestResult>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  const runTest = async (
    testName: string,
    testFunction: () => Promise<unknown>
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

  const testEnvironmentVariables = async () => {
    const response = await fetch("/api/debug/alpaca-oauth");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  };

  const testOAuthUrlGeneration = async () => {
    const testCases = [
      { environment: "paper" },
      { environment: "live" },
      { environment: null },
    ];

    const results = [];
    for (const testCase of testCases) {
      const params = new URLSearchParams();
      if (testCase.environment) {
        params.set("environment", testCase.environment);
      }

      const response = await fetch(
        `/api/debug/alpaca-oauth?${params.toString()}`
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      results.push({
        environment: testCase.environment || "both",
        result: await response.json(),
      });
    }
    return results;
  };

  const testApiConnectivity = async () => {
    // Test basic API connectivity without authentication
    const endpoints = [
      "https://api.alpaca.markets/v2/clock",
      "https://paper-api.alpaca.markets/v2/clock",
    ];

    const results = [];
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint);
        const data = await response.json();
        results.push({
          endpoint,
          status: response.status,
          success: response.ok,
          data: response.ok ? data : null,
          error: response.ok ? null : `HTTP ${response.status}`,
        });
      } catch (error) {
        results.push({
          endpoint,
          status: 0,
          success: false,
          data: null,
          error: error instanceof Error ? error.message : "Network error",
        });
      }
    }
    return results;
  };

  const testOAuthFlow = async () => {
    // This will test the full OAuth flow by generating an auth URL
    const response = await fetch(
      "/api/alpaca/oauth/authorize?userId=test_user_123&environment=paper"
    );
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  };

  const testTokenValidation = async () => {
    // Test if we can validate a token format (without making actual API calls)
    const mockToken = "mock_token_for_testing";
    const tokenUrl = "https://api.alpaca.markets/v2/account";

    // This will fail with 401, but we can check if the endpoint is reachable
    try {
      const response = await fetch(tokenUrl, {
        headers: {
          Authorization: `Bearer ${mockToken}`,
          Accept: "application/json",
        },
      });

      return {
        endpoint: tokenUrl,
        status: response.status,
        reachable: true,
        expectedError:
          response.status === 401
            ? "Unauthorized (expected)"
            : `Unexpected status: ${response.status}`,
      };
    } catch (error) {
      return {
        endpoint: tokenUrl,
        status: 0,
        reachable: false,
        error: error instanceof Error ? error.message : "Network error",
      };
    }
  };

  const testVerboseOAuth = async () => {
    // Test OAuth URL generation with verbose logging
    const response = await fetch("/api/debug/oauth-verbose-test?test=auth_url");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  };

  const testScopeValidation = async () => {
    // Test OAuth URL generation with different scope combinations
    const scopeTests = [
      { scope: "trading", description: "Trading only" },
      { scope: "account:write", description: "Account write only" },
      {
        scope: "trading account:write",
        description: "Trading + Account write",
      },
      { scope: "trading account:write data", description: "All scopes" },
    ];

    const results = [];
    for (const test of scopeTests) {
      try {
        // Generate a test URL with the scope
        const params = new URLSearchParams({
          response_type: "code",
          client_id: "test_client_id",
          redirect_uri: `${
            process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
          }/api/alpaca/oauth/callback`,
          scope: test.scope,
          state: "test_state",
        });

        const testUrl = `https://app.alpaca.markets/oauth/authorize?${params.toString()}`;

        results.push({
          scope: test.scope,
          description: test.description,
          url: testUrl,
          valid: true,
        });
      } catch (error) {
        results.push({
          scope: test.scope,
          description: test.description,
          valid: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
    return results;
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
    testFunction: () => Promise<unknown>;
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

              {result.data ? (
                <div className="p-3 bg-muted border rounded-md">
                  <pre className="text-xs overflow-auto max-h-64">
                    {JSON.stringify(
                      result.data as Record<string, unknown>,
                      null,
                      2
                    )}
                  </pre>
                </div>
              ) : null}
            </div>
          )}

          {children}
        </div>
      </Card>
    );
  };

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Alpaca OAuth Debug</h1>
        <p className="text-muted-foreground mt-2">
          Test and debug your Alpaca OAuth connection setup
        </p>
      </div>

      <Tabs defaultValue="environment" className="space-y-6">
        <TabsList className="grid w-full grid-cols-8">
          <TabsTrigger value="environment">Environment</TabsTrigger>
          <TabsTrigger value="urls">URL Generation</TabsTrigger>
          <TabsTrigger value="scopes">Scope Validation</TabsTrigger>
          <TabsTrigger value="connectivity">API Connectivity</TabsTrigger>
          <TabsTrigger value="oauth">OAuth Flow</TabsTrigger>
          <TabsTrigger value="verbose">Verbose OAuth</TabsTrigger>
          <TabsTrigger value="tokens">Token Validation</TabsTrigger>
          <TabsTrigger value="token-tester">Token Tester</TabsTrigger>
        </TabsList>

        <TabsContent value="environment" className="space-y-6">
          <TestCard
            title="Environment Variables Check"
            description="Verify that all required Alpaca OAuth environment variables are properly configured"
            testName="env-vars"
            testFunction={testEnvironmentVariables}
          />
        </TabsContent>

        <TabsContent value="urls" className="space-y-6">
          <TestCard
            title="OAuth URL Generation"
            description="Test OAuth authorization URL generation for different environments (paper, live, both)"
            testName="oauth-urls"
            testFunction={testOAuthUrlGeneration}
          />
        </TabsContent>

        <TabsContent value="scopes" className="space-y-6">
          <TestCard
            title="Scope Validation"
            description="Test OAuth scope combinations according to Alpaca's official documentation"
            testName="scope-validation"
            testFunction={testScopeValidation}
          />
        </TabsContent>

        <TabsContent value="connectivity" className="space-y-6">
          <TestCard
            title="API Connectivity Test"
            description="Test basic connectivity to Alpaca API endpoints (clock endpoint)"
            testName="api-connectivity"
            testFunction={testApiConnectivity}
          />
        </TabsContent>

        <TabsContent value="oauth" className="space-y-6">
          <TestCard
            title="OAuth Flow Test"
            description="Test the complete OAuth authorization flow (generates auth URL)"
            testName="oauth-flow"
            testFunction={testOAuthFlow}
          />
        </TabsContent>

        <TabsContent value="verbose" className="space-y-6">
          <TestCard
            title="Verbose OAuth Logging"
            description="Test OAuth with detailed logging - check your server console for complete OAuth2 flow logs"
            testName="verbose-oauth"
            testFunction={testVerboseOAuth}
          />
        </TabsContent>

        <TabsContent value="tokens" className="space-y-6">
          <TestCard
            title="Token Validation Test"
            description="Test token validation endpoint connectivity (will fail with 401, but confirms endpoint is reachable)"
            testName="token-validation"
            testFunction={testTokenValidation}
          />
        </TabsContent>

        <TabsContent value="token-tester" className="space-y-6">
          <AlpacaOAuthTester />
        </TabsContent>
      </Tabs>

      <Separator />

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Button
            variant="outline"
            onClick={() => {
              setResults({});
              setLoading({});
            }}
            className="h-12"
          >
            Clear All Results
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              await runTest("env-vars", testEnvironmentVariables);
              await runTest("oauth-urls", testOAuthUrlGeneration);
              await runTest("scope-validation", testScopeValidation);
              await runTest("api-connectivity", testApiConnectivity);
            }}
            className="h-12"
          >
            Run All Basic Tests
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Debug Information</h2>
        <Card className="p-4">
          <div className="space-y-2 text-sm">
            <p>
              <strong>Current URL:</strong>{" "}
              {typeof window !== "undefined"
                ? window.location.href
                : "Server-side"}
            </p>
            <p>
              <strong>App URL:</strong>{" "}
              {process.env.NEXT_PUBLIC_APP_URL || "Not set"}
            </p>
            <p>
              <strong>Environment:</strong> {process.env.NODE_ENV || "Unknown"}
            </p>
            <p>
              <strong>Timestamp:</strong> {new Date().toISOString()}
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
