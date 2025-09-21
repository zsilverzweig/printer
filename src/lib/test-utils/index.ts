// Test utilities index - exports all test helpers and mocks

// Core test utilities
export * from "./test-utils";

// Mock utilities
export * from "./firebase-mocks";
export * from "./stripe-mocks";
export * from "./user-mocks";

// Re-export commonly used items for convenience
export {
  calculatePriorityScore,
  createMockUser,
  createMockWaitlistEntry,
  createMockWaitlistPayment,
  createSortedWaitlist,
  waitlistTestData,
} from "./test-utils";

export {
  createFirebaseMocks,
  setupFirebaseMocks,
  setupMockRealtimeListener,
  setupMockWaitlistEntry,
  setupMockWaitlistJoin,
} from "./firebase-mocks";

export {
  authTestScenarios,
  createMockAuthContext,
  createMockAuthUser,
  setupAuthMock,
} from "./user-mocks";

export {
  createMockStripeSession,
  setupStripeMocks,
  simulateCheckoutFlow,
  stripeTestScenarios,
} from "./stripe-mocks";
