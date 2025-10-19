/**
 * Root Layout (app/layout.tsx)
 *
 * PURPOSE: Main application wrapper that provides global providers and layout structure.
 *
 * ARCHITECTURE ROLE:
 * - Server-side user authentication (getServerUser)
 * - Global providers (AuthProvider, Toaster)
 * - App-level layout wrapper (AppLayout)
 *
 * FLOW:
 * 1. Server-side: Get user from cookies
 * 2. Client-side: Provide user to AuthProvider
 * 3. AppLayout: Handle UI layout decisions
 * 4. Pages: Render with proper authentication context
 *
 * SIMPLIFIED STRUCTURE:
 * - Direct children to AppLayout
 * - Middleware handles routing logic
 * - Clean, minimal component tree
 */

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";

import { getServerUser } from "@/lib/auth/server";
import { AppLayout } from "@/lib/components/app-layout";
import { LayoutWidgets } from "@/lib/components/layout-widgets";
import { AuthProvider } from "@/lib/providers/auth-provider";

import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Printer - AI Investment Research",
  description:
    "An AI-powered investment research engine that produces actionable, company-level investment theses through structured reasoning and adversarial testing.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Get user from server-side cookies
  const user = await getServerUser();

  return (
    <html lang="en" className="dark">
      <meta name="apple-mobile-web-app-title" content="printer" />
      <body className={inter.className}>
        <AuthProvider initialUser={user}>
          <AppLayout>{children}</AppLayout>
          <LayoutWidgets />
          <Toaster
            position="bottom-right"
            expand={true}
            richColors={true}
            closeButton={true}
          />
        </AuthProvider>
      </body>
    </html>
  );
}
