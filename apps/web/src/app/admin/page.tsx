import { Cpu, Table, Upload, Wrench } from "lucide-react";
import Link from "next/link";

import { requireAdmin } from "@/lib/auth/server";
import { Button } from "@/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";

/**
 * Server Component - runs on the server before page renders
 *
 * Benefits:
 * - Admin authentication check happens on server
 * - No flash of protected content
 * - Better security
 * - Faster page loads
 */
export default async function AdminPage() {
  // This runs on the server and redirects if user is not admin
  const user = await requireAdmin();

  // If we reach here, user is authenticated and is admin
  return (
    <div className="container mx-auto p-6">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-gray-600 mt-2">
            Manage your Printer application settings and configurations
          </p>
        </div>

        {/* Admin Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex items-center space-x-2">
                <Cpu className="h-5 w-5 text-indigo-600" />
                <CardTitle>AI Sandbox</CardTitle>
              </div>
              <CardDescription>
                Test AI functions, portfolio generation, and OpenAI integration
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/admin/ai-sandbox">
                <Button className="w-full">Open AI Sandbox</Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Utilities Section */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Utilities</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <Table className="h-5 w-5 text-blue-600" />
                  <CardTitle>Database</CardTitle>
                </div>
                <CardDescription>
                  Query and explore database with SQL or natural language
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link href="/admin/database">
                  <Button className="w-full">Open Database</Button>
                </Link>
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <Wrench className="h-5 w-5 text-orange-600" />
                  <CardTitle>Alpaca Debug</CardTitle>
                </div>
                <CardDescription>
                  Debug and test Alpaca OAuth integration
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link href="/admin/alpaca-debug">
                  <Button className="w-full">Open Debug Tool</Button>
                </Link>
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <Upload className="h-5 w-5 text-purple-600" />
                  <CardTitle>Data Loading</CardTitle>
                </div>
                <CardDescription>
                  Load ticker details and historical market data
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link href="/admin/assets">
                  <Button className="w-full">Manage Assets</Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
