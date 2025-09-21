// Shared test utilities and helpers

export interface MockUser {
  uid: string;
  email: string;
  displayName?: string;
}

export interface MockWaitlistEntry {
  id: string;
  userId: string;
  email: string;
  displayName?: string;
  position: number;
  totalActions: number;
  totalPoints: number;
  paidUpgrades: number;
  isPaidUser: boolean;
  priorityScore: number;
  status: "active" | "invited" | "converted" | "cancelled";
  joinedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  lastActionAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface MockWaitlistPayment {
  id: string;
  waitlistEntryId: string;
  userId: string;
  amount: number;
  positions: number;
  status: "pending" | "completed" | "failed" | "refunded";
  stripeSessionId?: string;
  paymentIntentId?: string;
  completedAt?: Date;
  createdAt: Date;
}

// Factory functions for creating test data
export const createMockUser = (
  overrides: Partial<MockUser> = {}
): MockUser => ({
  uid: "test-user-123",
  email: "test@example.com",
  displayName: "Test User",
  ...overrides,
});

export const createMockWaitlistEntry = (
  overrides: Partial<MockWaitlistEntry> = {}
): MockWaitlistEntry => ({
  id: "waitlist-entry-123",
  userId: "test-user-123",
  email: "test@example.com",
  displayName: "Test User",
  position: 1,
  totalActions: 0,
  totalPoints: 0,
  paidUpgrades: 0,
  isPaidUser: false,
  priorityScore: 0,
  status: "active",
  joinedAt: new Date("2023-01-01T00:00:00Z"),
  createdAt: new Date("2023-01-01T00:00:00Z"),
  updatedAt: new Date("2023-01-01T00:00:00Z"),
  metadata: {},
  ...overrides,
});

export const createMockWaitlistPayment = (
  overrides: Partial<MockWaitlistPayment> = {}
): MockWaitlistPayment => ({
  id: "payment-123",
  waitlistEntryId: "waitlist-entry-123",
  userId: "test-user-123",
  amount: 30,
  positions: 3,
  status: "completed",
  stripeSessionId: "cs_test_123",
  paymentIntentId: "pi_test_123",
  completedAt: new Date("2023-01-01T00:00:00Z"),
  createdAt: new Date("2023-01-01T00:00:00Z"),
  ...overrides,
});

// Test data builders for common scenarios
export const waitlistTestData = {
  newUser: () =>
    createMockWaitlistEntry({
      totalActions: 0,
      totalPoints: 0,
      paidUpgrades: 0,
      isPaidUser: false,
      priorityScore: 0,
    }),

  activeUser: () =>
    createMockWaitlistEntry({
      totalActions: 2,
      totalPoints: 10,
      paidUpgrades: 0,
      isPaidUser: false,
      priorityScore: 10,
    }),

  paidUser: () =>
    createMockWaitlistEntry({
      totalActions: 1,
      totalPoints: 5,
      paidUpgrades: 2,
      isPaidUser: true,
      priorityScore: 1000205, // 1000000 + (2 * 100) + 5
    }),

  highPointsUser: () =>
    createMockWaitlistEntry({
      totalActions: 5,
      totalPoints: 50,
      paidUpgrades: 0,
      isPaidUser: false,
      priorityScore: 50,
    }),
};

// Helper for calculating priority scores
export const calculatePriorityScore = (
  isPaidUser: boolean,
  paidUpgrades: number,
  totalPoints: number
): number => {
  const safePaidUpgrades = paidUpgrades || 0;
  const safeTotalPoints = totalPoints || 0;

  return isPaidUser
    ? 1000000 + safePaidUpgrades * 100 + safeTotalPoints
    : safeTotalPoints;
};

// Helper for creating sorted waitlist entries
export const createSortedWaitlist = (entries: Partial<MockWaitlistEntry>[]) => {
  return entries
    .map((entry) => createMockWaitlistEntry(entry))
    .sort((a, b) => {
      if (b.priorityScore !== a.priorityScore) {
        return b.priorityScore - a.priorityScore;
      }
      return a.joinedAt.getTime() - b.joinedAt.getTime();
    })
    .map((entry, index) => ({
      ...entry,
      position: index + 1,
    }));
};
