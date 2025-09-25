"use client";

import { useAuthContext } from "@/lib/providers/auth-provider";
import { useWaitlist } from "@/features/waitlist/hooks/use-waitlist";
import { WaitlistDashboard } from "@/features/waitlist/components/waitlist-dashboard";
import { log } from "@/lib/utils/logger";

export default function WaitlistSignupPage() {
  const { user } = useAuthContext();
  const { joinWaitlist } = useWaitlist();

  const handleJoinWaitlist = async () => {
    if (!user?.email) return;
    
    try {
      await joinWaitlist(user.email, {
        source: "signup_flow",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      log.error("Failed to join waitlist", error, "WaitlistSignupPage");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <WaitlistDashboard onJoinWaitlist={handleJoinWaitlist} />
    </div>
  );
}
