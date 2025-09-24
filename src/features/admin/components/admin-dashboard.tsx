"use client";

import {
  Mail,
  RefreshCw,
  Send,
  Settings,
  TrendingUp,
  Users,
  UserX,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/lib/components/ui/button";
import { Card } from "@/lib/components/ui/card";
import { Input } from "@/lib/components/ui/input";
import { log } from "@/lib/utils/logger";

import { useAdmin } from "../hooks/use-admin";

export function AdminDashboard() {
  const {
    config,
    stats,
    users,
    loading,
    error,
    sendInvites,
    removeWaitlistEntry,
    updateWaitlistEntryStatus,
    refreshStats,
  } = useAdmin();

  const [isSendingInvites, setIsSendingInvites] = useState(false);
  const [inviteCount, setInviteCount] = useState(10);

  const handleSendInvites = async () => {
    try {
      setIsSendingInvites(true);
      await sendInvites(inviteCount);
    } catch (err) {
      log.error("Failed to send invites", err, "AdminDashboard");
    } finally {
      setIsSendingInvites(false);
    }
  };

  const handleRemoveEntry = async (entryId: string) => {
    if (confirm("Are you sure you want to remove this entry?")) {
      try {
        await removeWaitlistEntry(entryId);
      } catch (err) {
        log.error("Failed to remove entry", err, "AdminDashboard");
      }
    }
  };

  const handleUpdateStatus = async (entryId: string, status: string) => {
    try {
      await updateWaitlistEntryStatus(entryId, status);
    } catch (err) {
      log.error("Failed to update status", err, "AdminDashboard");
    }
  };

  if (loading && !config) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-gray-600 mt-1">
            Manage waitlist and system settings
          </p>
        </div>
        <Button onClick={refreshStats} variant="outline" disabled={loading}>
          <RefreshCw
            className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="p-6">
            <div className="flex items-center">
              <Users className="w-8 h-8 text-blue-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">
                  Total Entries
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.totalEntries}
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center">
              <TrendingUp className="w-8 h-8 text-green-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">
                  Avg Position
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.averagePosition}
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center">
              <Mail className="w-8 h-8 text-purple-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">
                  Conversion Rate
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.conversionRate}%
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center">
              <Settings className="w-8 h-8 text-orange-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Status</p>
                <p className="text-2xl font-bold text-gray-900">
                  {config?.waitlistEnabled ? "Enabled" : "Disabled"}
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Configuration */}
      {config && (
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Waitlist Configuration</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Waitlist Enabled</p>
                <p className="text-sm text-gray-600">
                  Allow users to join the waitlist
                </p>
              </div>
              <div
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  config.waitlistEnabled
                    ? "bg-green-100 text-green-800"
                    : "bg-red-100 text-red-800"
                }`}
              >
                {config.waitlistEnabled ? "Enabled" : "Disabled"}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Auto-Add to Waitlist</p>
                <p className="text-sm text-gray-600">
                  Automatically add new users to waitlist
                </p>
              </div>
              <div
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  config.autoAddToWaitlist
                    ? "bg-green-100 text-green-800"
                    : "bg-red-100 text-red-800"
                }`}
              >
                {config.autoAddToWaitlist ? "Enabled" : "Disabled"}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Waitlist Capacity</p>
                <p className="text-sm text-gray-600">
                  Maximum number of waitlist entries
                </p>
              </div>
              <span className="text-sm font-medium text-gray-900">
                {config.waitlistCapacity || "Unlimited"}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Invite Batch Size</p>
                <p className="text-sm text-gray-600">
                  Number of invites to send at once
                </p>
              </div>
              <span className="text-sm font-medium text-gray-900">
                {config.inviteBatchSize}
              </span>
            </div>
          </div>
        </Card>
      )}

      {/* Send Invites */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Send Invites</h2>
        <div className="flex items-center space-x-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Number of invites
            </label>
            <Input
              type="number"
              min="1"
              max="100"
              value={inviteCount}
              onChange={(e) => setInviteCount(parseInt(e.target.value) || 1)}
              className="w-24"
            />
          </div>
          <Button
            onClick={handleSendInvites}
            disabled={isSendingInvites || loading}
            className="mt-6"
          >
            {isSendingInvites ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Send Invites
              </>
            )}
          </Button>
        </div>
      </Card>

      {/* Waitlist Entries */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Waitlist Entries</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Position
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Points
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Joined
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.slice(0, 20).map((user) => (
                <tr key={user.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    #{user.waitlistEntry?.position || "N/A"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {user.email}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {user.waitlistEntry?.totalPoints || 0}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${
                        user.waitlistEntry?.status === "active"
                          ? "bg-green-100 text-green-800"
                          : user.waitlistEntry?.status === "invited"
                          ? "bg-blue-100 text-blue-800"
                          : user.waitlistEntry?.status === "converted"
                          ? "bg-purple-100 text-purple-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {user.waitlistEntry?.status || "N/A"}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {user.createdAt?.toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                    <select
                      value={user.waitlistEntry?.status || "active"}
                      onChange={(e) =>
                        handleUpdateStatus(user.id, e.target.value)
                      }
                      className="text-xs border border-gray-300 rounded px-2 py-1"
                    >
                      <option value="active">Active</option>
                      <option value="invited">Invited</option>
                      <option value="converted">Converted</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRemoveEntry(user.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <UserX className="w-3 h-3" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {users.length > 20 && (
          <p className="mt-4 text-sm text-gray-600">
            Showing first 20 entries of {users.length} total
          </p>
        )}
      </Card>
    </div>
  );
}
