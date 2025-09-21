// Waitlist feature types for Printer

export interface WaitlistEntry {
  id: string;
  userId: string;
  email: string;
  displayName?: string;
  position: number;
  joinedAt: Date;
  lastActionAt?: Date;
  totalActions: number;
  paidUpgrades: number;
  totalPoints: number;
  isPaidUser: boolean; // New field to track if user has made any payments
  priorityScore: number; // New field for priority positioning (paid users get higher scores)
  status: "active" | "invited" | "converted" | "cancelled";
  metadata: {
    source?: string;
    referralCode?: string;
    userAgent?: string;
    ipAddress?: string;
    utmParams?: Record<string, string>;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface WaitlistAction {
  id: string;
  type: ActionTypeId;
  userId: string;
  waitlistEntryId: string;
  points: number;
  completedAt: Date;
  status: "pending" | "completed" | "failed";
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export type ActionTypeId =
  | "referral_signup"
  | "survey_completion"
  | "payment_upgrade"
  | "email_verification"
  | "profile_completion";

export interface ActionType {
  id: ActionTypeId;
  name: string;
  description: string;
  points: number;
  cost?: number;
  isActive: boolean;
  maxUses?: number;
  cooldownHours?: number;
  requirements?: string[];
  icon?: string;
  category: "social" | "referral" | "engagement" | "payment";
}

export interface WaitlistPayment {
  id: string;
  waitlistEntryId: string;
  userId: string;
  amount: number;
  positions: number;
  status: "pending" | "completed" | "failed" | "refunded";
  paymentIntentId?: string;
  stripeSessionId?: string;
  completedAt?: Date;
  createdAt: Date;
}

export interface WaitlistConfig {
  isOpen: boolean;
  maxCapacity?: number;
  inviteBatchSize: number;
  actionTypes: ActionType[];
  pointsPerPosition: number;
  paymentOptions: {
    enabled: boolean;
    pricePerPosition: number;
    maxPositionsPerPurchase: number;
  };
}

// Hook return types
export interface UseWaitlistReturn {
  entry: WaitlistEntry | null;
  position: number | null;
  actions: WaitlistAction[];
  availableActions: ActionType[];
  loading: boolean;
  error: string | null;
  joinWaitlist: (
    email: string,
    metadata?: Record<string, unknown>
  ) => Promise<void>;
  performAction: (
    actionType: ActionTypeId,
    metadata?: Record<string, unknown>
  ) => Promise<void>;
  purchaseUpgrade: (positions: number) => Promise<void>;
  refreshPosition: () => Promise<void>;
}

export interface UseWaitlistAdminReturn {
  entries: WaitlistEntry[];
  config: WaitlistConfig | null;
  loading: boolean;
  error: string | null;
  updateConfig: (config: Partial<WaitlistConfig>) => Promise<void>;
  sendInvites: (count: number) => Promise<void>;
  removeEntry: (entryId: string) => Promise<void>;
  updateEntryStatus: (
    entryId: string,
    status: WaitlistEntry["status"]
  ) => Promise<void>;
}
