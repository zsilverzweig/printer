import {
  BarChart3,
  Cpu,
  Database,
  Settings,
  Users,
  Wrench,
} from "lucide-react";
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

          <Card className="hover:shadow-md transition-shadow opacity-50">
            <CardHeader>
              <div className="flex items-center space-x-2">
                <Users className="h-5 w-5 text-green-600" />
                <CardTitle>User Management</CardTitle>
              </div>
              <CardDescription>
                Manage user accounts and permissions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" disabled>
                Coming Soon
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow opacity-50">
            <CardHeader>
              <div className="flex items-center space-x-2">
                <Settings className="h-5 w-5 text-gray-600" />
                <CardTitle>System Settings</CardTitle>
              </div>
              <CardDescription>
                Configure system-wide settings and preferences
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" disabled>
                Coming Soon
              </Button>
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
                  <Database className="h-5 w-5 text-blue-600" />
                  <CardTitle>Database Admin</CardTitle>
                </div>
                <CardDescription>
                  Query and explore database with SQL or natural language
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link href="/admin/database">
                  <Button className="w-full">Open Database Admin</Button>
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
                  <BarChart3 className="h-5 w-5 text-purple-600" />
                  <CardTitle>Market Data</CardTitle>
                </div>
                <CardDescription>
                  Load and manage historical market data from TimescaleDB
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link href="/admin/market-data">
                  <Button className="w-full">Manage Market Data</Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                AI Operations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">2</div>
              <p className="text-xs text-gray-600">Portfolio & Thesis</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Total Users
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">-</div>
              <p className="text-xs text-gray-600">Coming soon</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                System Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">Online</div>
              <p className="text-xs text-gray-600">All systems operational</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
