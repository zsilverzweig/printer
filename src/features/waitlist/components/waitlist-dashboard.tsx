"use client";

import { CreditCard, Crown, Share2, Users } from "lucide-react";
import { useState } from "react";

import { Button } from "@/lib/components/ui/button";
import { Card } from "@/lib/components/ui/card";
import { Separator } from "@/lib/components/ui/separator";
import { log } from "@/lib/utils/logger";

import { useWaitlist } from "../hooks/use-waitlist";

interface WaitlistDashboardProps {
  onJoinWaitlist?: () => void;
}

export function WaitlistDashboard({ onJoinWaitlist }: WaitlistDashboardProps) {
  const {
    entry,
    position,
    availableActions,
    performAction,
    purchaseUpgrade,
    loading,
  } = useWaitlist();
  const [isPerformingAction, setIsPerformingAction] = useState<string | null>(
    null
  );

  const handleAction = async (actionType: string) => {
    try {
      setIsPerformingAction(actionType);
      await performAction(actionType as any);
    } catch (err) {
      log.error("Failed to perform action", err, "WaitlistDashboard");
    } finally {
      setIsPerformingAction(null);
    }
  };

  const handlePurchaseUpgrade = async (positions: number) => {
    try {
      await purchaseUpgrade(positions);
    } catch (err) {
      log.error("Failed to purchase upgrade", err, "WaitlistDashboard");
    }
  };

  const getActionIcon = (actionType: string) => {
    switch (actionType) {
      case "referral_signup":
        return <Users className="w-4 h-4" />;
      case "payment_upgrade":
        return <CreditCard className="w-4 h-4" />;
      default:
        return <Share2 className="w-4 h-4" />;
    }
  };

  if (!entry) {
    return (
      <div className="flex items-center justify-center min-h-full">
        <Card className="p-6 max-w-md mx-auto">
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-2">Join the Waitlist</h2>
            <p className="text-gray-600 mb-4">
              You&apos;re not on the waitlist yet. Join now to get early access
              to Printer!
            </p>
            <Button
              onClick={onJoinWaitlist}
              className="w-full"
              disabled={loading}
            >
              {loading ? "Joining..." : "Join Waitlist"}
            </Button>
            <p className="text-xs text-gray-500 mt-4">
              By joining, you&apos;ll get early access to our AI-powered
              investment research platform.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 p-6">
      {/* Position Card */}
      <Card
        className={`p-6 ${
          entry.isPaidUser
            ? "border-yellow-400 bg-gradient-to-br from-yellow-50 to-amber-50"
            : ""
        }`}
      >
        <div className="text-center">
          <div className="flex items-center justify-center mb-2">
            {entry.isPaidUser && (
              <Crown className="w-6 h-6 text-yellow-500 mr-2" />
            )}
            <h2
              className={`text-3xl font-bold ${
                entry.isPaidUser ? "text-yellow-600" : "text-blue-600"
              }`}
            >
              #{position}
            </h2>
          </div>
          <p className="text-gray-600 mb-4">
            {entry.isPaidUser
              ? "Your premium position in the waitlist"
              : "Your position in the waitlist"}
          </p>
          {entry.isPaidUser && (
            <div className="mb-4 p-3 bg-yellow-100 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800 font-medium">
                🎉 Premium Member - You're at the top of the waitlist!
              </p>
            </div>
          )}
          <div className="flex justify-center space-x-4 text-sm text-gray-500">
            <span>{entry.totalActions} actions completed</span>
            <span>•</span>
            <span>{entry.totalPoints} points earned</span>
            {entry.paidUpgrades > 0 && (
              <>
                <span>•</span>
                <span className="font-medium text-yellow-600">
                  {entry.paidUpgrades} premium upgrades
                </span>
              </>
            )}
          </div>
        </div>
      </Card>

      {/* Actions Card */}
      <Card className="p-6">
        <h3 className="text-xl font-semibold mb-4">Move Up in Line</h3>
        <p className="text-gray-600 mb-6">
          Complete actions to earn points and move up in the waitlist
        </p>

        <div className="space-y-3">
          {availableActions.map((action) => (
            <div
              key={action.id}
              className="flex items-center justify-between p-4 border rounded-lg"
            >
              <div className="flex items-center space-x-3">
                {getActionIcon(action.id)}
                <div>
                  <h4 className="font-medium">{action.name}</h4>
                  <p className="text-sm text-gray-600">{action.description}</p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium text-green-600">
                  +{action.points} positions
                </div>
                {action.cost && (
                  <div className="text-xs text-gray-500">
                    ${action.cost} per position
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <Separator className="my-6" />

        {/* Action Buttons */}
        <div className="space-y-3">
          <Button
            onClick={() => handleAction("referral_signup")}
            disabled={loading || isPerformingAction === "referral_signup"}
            variant="outline"
            className="w-full"
          >
            {isPerformingAction === "referral_signup" ? (
              "Processing..."
            ) : (
              <>
                <Users className="w-4 h-4 mr-2" />
                Invite Friends (+5 positions)
              </>
            )}
          </Button>

          <Separator className="my-4" />

          <div className="text-center mb-4">
            <h4 className="font-semibold text-lg mb-2">Buy Your Spot</h4>
            <p className="text-sm text-gray-600 mb-4">
              Skip the line and get priority access to Printer
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Button
              onClick={() => handlePurchaseUpgrade(1)}
              disabled={loading}
              className="w-full bg-yellow-600 hover:bg-yellow-700"
            >
              <Crown className="w-4 h-4 mr-2" />
              Buy 1 Position ($10)
            </Button>

            <Button
              onClick={() => handlePurchaseUpgrade(5)}
              disabled={loading}
              className="w-full bg-yellow-600 hover:bg-yellow-700"
            >
              <Crown className="w-4 h-4 mr-2" />
              Buy 5 Positions ($50)
            </Button>
          </div>

          <div className="mt-3 text-center">
            <Button
              onClick={() => handlePurchaseUpgrade(10)}
              disabled={loading}
              variant="outline"
              className="w-full border-yellow-400 text-yellow-600 hover:bg-yellow-50"
            >
              <Crown className="w-4 h-4 mr-2" />
              Buy 10 Positions ($100)
            </Button>
          </div>
        </div>
      </Card>

      {/* Status Card */}
      <Card className="p-6">
        <h3 className="text-xl font-semibold mb-4">Waitlist Status</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Joined:</span>
            <span>{entry.joinedAt.toLocaleDateString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Status:</span>
            <span className="capitalize">{entry.status}</span>
          </div>
          {entry.lastActionAt && (
            <div className="flex justify-between">
              <span className="text-gray-600">Last Action:</span>
              <span>{entry.lastActionAt.toLocaleDateString()}</span>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
