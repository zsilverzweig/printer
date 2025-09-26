import { Printer } from "lucide-react";
import { redirect } from "next/navigation";

import { getServerUser } from "@/lib/auth/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import { SignUpInfoForm } from "./signup-info-form";

/**
 * Server Component - runs on the server before page renders
 *
 * Benefits:
 * - Authentication check happens on server
 * - No flash of protected content
 * - Better SEO
 * - Faster page loads
 * - More secure
 */
export default async function SignUpInfoPage() {
  // Get user from server-side cookies
  const user = await getServerUser();

  // If no user, redirect to signup
  if (!user) {
    redirect("/signup");
  }

  // If user is not pending, redirect based on their status
  if (user.status !== "pending") {
    if (user.status === "waitlist") {
      redirect("/waitlist");
    } else if (user.status === "active") {
      redirect("/portfolios");
    }
  }

  // If we reach here, user is authenticated and pending

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader className="text-center">
              <div className="flex items-center justify-center mb-4">
                <Printer className="h-12 w-12 text-primary" />
              </div>
              <CardTitle className="text-2xl">Complete Your Profile</CardTitle>
              <CardDescription>
                Help us personalize your investment experience
              </CardDescription>
            </CardHeader>

            <CardContent>
              {/* Pass user data to client component */}
              <SignUpInfoForm user={user} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
