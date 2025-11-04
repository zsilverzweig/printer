"use client";

import { WelcomePage } from "@/lib/components/welcome-page";
import { useAuthContext } from "@/lib/providers/auth-provider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Home page that shows:
 * - Welcome page for unauthenticated users
 * - Redirects to funds for authenticated users
 */
export default function HomePage() {
  const { isAuthenticated, loading } = useAuthContext();
  const router = useRouter();

  // Redirect authenticated users to funds page
  useEffect(() => {
    if (!loading && isAuthenticated) {
      router.push("/funds");
    }
  }, [isAuthenticated, loading, router]);

  if (loading) {
    return (
      <div className="w-full h-screen p-6 flex items-center justify-center">
        Loading...
      </div>
    );
  }

  // Show welcome page for unauthenticated users
  return <WelcomePage />;
}
