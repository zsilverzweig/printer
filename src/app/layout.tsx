import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";

import { getServerUser } from "@/lib/auth/server";
import { AppLayout } from "@/lib/components/app-layout";
import { AppRouter } from "@/lib/components/app-router";
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
          <AppLayout>
            <AppRouter>{children}</AppRouter>
          </AppLayout>
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
