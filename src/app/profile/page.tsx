"use client";

import { AlpacaConnectionCard } from "@/features/finance/trading/components/alpaca-connection-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/lib/components/ui/tabs";
import { useAuthContext } from "@/lib/providers/auth-provider";
import { Bell, CreditCard, Settings, Shield, User } from "lucide-react";

export default function ProfilePage() {
  const { user, isAdmin } = useAuthContext();

  return (
    <div className="container mx-auto max-w-4xl space-y-6 px-6 py-8">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">User Profile</h1>
        <p className="text-muted-foreground">
          Manage your account settings, connected services, and preferences
        </p>
      </div>

      {/* User Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Account Information
          </CardTitle>
          <CardDescription>
            Your basic account details and authentication status
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Email
              </label>
              <p className="text-sm">{user?.email || "Not available"}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                User ID
              </label>
              <p className="text-sm font-mono text-xs">
                {user?.uid || "Not available"}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Role
              </label>
              <p className="text-sm flex items-center gap-2">
                {isAdmin ? (
                  <>
                    <Shield className="h-4 w-4 text-blue-600" />
                    Administrator
                  </>
                ) : (
                  "Standard User"
                )}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Account Status
              </label>
              <p className="text-sm text-green-600">Active</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Settings Tabs */}
      <Tabs defaultValue="connections" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="connections">Connections</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
        </TabsList>

        {/* Connections Tab */}
        <TabsContent value="connections" className="space-y-6">
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Connected Services</h2>
            <p className="text-muted-foreground">
              Manage your integrations with external services
            </p>
          </div>

          <AlpacaConnectionCard />

          {/* Placeholder for other connections */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Payment Methods
              </CardTitle>
              <CardDescription>
                Manage your payment information and billing
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <CreditCard className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">
                  No payment methods connected
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  Connect a payment method to enable premium features
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Preferences Tab */}
        <TabsContent value="preferences" className="space-y-6">
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Preferences</h2>
            <p className="text-muted-foreground">
              Customize your experience and notification settings
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notifications
              </CardTitle>
              <CardDescription>
                Choose how you want to be notified about important events
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Portfolio Updates</p>
                  <p className="text-sm text-muted-foreground">
                    Get notified when your portfolios are updated
                  </p>
                </div>
                <div className="h-4 w-8 bg-muted rounded-full cursor-pointer" />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Trading Alerts</p>
                  <p className="text-sm text-muted-foreground">
                    Receive alerts for trading opportunities
                  </p>
                </div>
                <div className="h-4 w-8 bg-primary rounded-full cursor-pointer" />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">System Updates</p>
                  <p className="text-sm text-muted-foreground">
                    Important system announcements and updates
                  </p>
                </div>
                <div className="h-4 w-8 bg-primary rounded-full cursor-pointer" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Display Settings
              </CardTitle>
              <CardDescription>
                Customize how information is displayed
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Dark Mode</p>
                  <p className="text-sm text-muted-foreground">
                    Switch between light and dark themes
                  </p>
                </div>
                <div className="h-4 w-8 bg-muted rounded-full cursor-pointer" />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Compact View</p>
                  <p className="text-sm text-muted-foreground">
                    Show more information in a compact layout
                  </p>
                </div>
                <div className="h-4 w-8 bg-muted rounded-full cursor-pointer" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="space-y-6">
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Security</h2>
            <p className="text-muted-foreground">
              Manage your account security and privacy settings
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Account Security
              </CardTitle>
              <CardDescription>
                Manage your password and security settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">
                    Two-Factor Authentication
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Add an extra layer of security to your account
                  </p>
                </div>
                <div className="h-4 w-8 bg-muted rounded-full cursor-pointer" />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Login Notifications</p>
                  <p className="text-sm text-muted-foreground">
                    Get notified when someone logs into your account
                  </p>
                </div>
                <div className="h-4 w-8 bg-primary rounded-full cursor-pointer" />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Session Management</p>
                  <p className="text-sm text-muted-foreground">
                    View and manage active sessions
                  </p>
                </div>
                <button className="text-sm text-primary hover:underline">
                  Manage Sessions
                </button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Billing Tab */}
        <TabsContent value="billing" className="space-y-6">
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Billing & Subscription</h2>
            <p className="text-muted-foreground">
              Manage your subscription and billing information
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Current Plan
              </CardTitle>
              <CardDescription>
                Your current subscription details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-semibold">Free Waitlist</p>
                  <p className="text-sm text-muted-foreground">
                    You're on the waitlist for early access
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold">$0</p>
                  <p className="text-sm text-muted-foreground">per month</p>
                </div>
              </div>
              <div className="pt-4 border-t">
                <button className="text-sm text-primary hover:underline">
                  View Available Plans
                </button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Billing History</CardTitle>
              <CardDescription>
                Your recent billing and payment history
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <CreditCard className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">No billing history</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Your billing history will appear here once you start a
                  subscription
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
