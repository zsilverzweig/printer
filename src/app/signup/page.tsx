"use client";

import { AlertCircle, Loader2, Printer } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import { useAuth } from "@/lib/hooks/use-auth";
import { useUserRouting } from "@/lib/hooks/use-user-routing";
import { log } from "@/lib/utils/logger";

export default function SignupPage() {
  const { signInWithGoogle, loading, error, isAuthenticated } = useAuth();
  const { route, loading: routingLoading } = useUserRouting();
  const router = useRouter();
  const [isSigningUp, setIsSigningUp] = useState(false);


  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && route && !routingLoading) {
      log.info(
        "Redirecting authenticated user",
        {
          route: route.path,
          reason: route.reason,
        },
        "SignupPage"
      );
      // Use replace to avoid adding to history stack
      router.replace(route.path);
    }
  }, [isAuthenticated, route, routingLoading, router]);

  const handleGoogleSignIn = async () => {
    try {
      setIsSigningUp(true);
      await signInWithGoogle();
      // Don't manually redirect - let the useEffect handle it after auth state updates
      // Keep isSigningUp true until redirect happens
    } catch (err) {
      log.error("Sign-up failed", err, "SignupPage");
      setIsSigningUp(false); // Only reset on error
    }
  };

  // Show loading state if authenticated, routing is loading, or signing up
  if (isAuthenticated || routingLoading || isSigningUp) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">
            {isAuthenticated ? 'Redirecting...' : isSigningUp ? 'Creating account...' : 'Loading...'}
          </p>
        </div>
      </div>
    );
  }


  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center mb-4">
            <Printer className="h-12 w-12 text-primary" />
          </div>
          <CardTitle className="text-2xl">Join Printer</CardTitle>
          <CardDescription>
            Create your account to start building AI-powered investment
            portfolios
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <Button
            onClick={handleGoogleSignIn}
            disabled={loading || isSigningUp}
            className="w-full"
            size="lg"
          >
            {loading || isSigningUp ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating account...
              </>
            ) : (
              <>
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Sign up with Google
              </>
            )}
          </Button>

          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              Already have an account?{" "}
              <Button
                variant="link"
                className="p-0 h-auto"
                onClick={() => router.push("/login")}
              >
                Sign in
              </Button>
            </p>
          </div>

          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              By signing up, you agree to our Terms of Service and Privacy
              Policy
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
