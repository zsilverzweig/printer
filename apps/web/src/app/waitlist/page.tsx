"use client";

import { WaitlistDashboard } from "@/features/waitlist/components/waitlist-dashboard";
import { useWaitlist } from "@/features/waitlist/hooks/use-waitlist";
import { useAuthContext } from "@/lib/providers/auth-provider";
import { log } from "@/lib/utils/logger";

export default function WaitlistPage() {
  const { user } = useAuthContext();
  const { joinWaitlist } = useWaitlist();

  const handleJoinWaitlist = async () => {
    if (!user?.email) return;

    try {
      await joinWaitlist(user.email, {
        source: "manual_join",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      log.error("Failed to join waitlist", error, "WaitlistPage");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <WaitlistDashboard onJoinWaitlist={handleJoinWaitlist} />
    </div>
  );
}
