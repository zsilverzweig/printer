// Refactored tests for WaitlistService using new test infrastructure
import { createFirebaseMocks, waitlistTestData } from "@/__tests__/utils";
import { WaitlistService } from "../waitlist-service";

describe("WaitlistService", () => {
  let service: WaitlistService;
  let mocks: ReturnType<typeof createFirebaseMocks>;

  beforeEach(() => {
    service = WaitlistService.getInstance();
    mocks = createFirebaseMocks();
    jest.clearAllMocks();
  });

  describe("joinWaitlist", () => {
    it("should successfully join the waitlist", async () => {
      // Setup
      const mockDocRef = { id: "waitlist-entry-123" };
      const mockSnapshot = { size: 2, docs: [] };
      mocks.mockGetDocs.mockResolvedValue(mockSnapshot);
      mocks.mockAddDoc.mockResolvedValue(mockDocRef);

      // Execute
      const result = await service.joinWaitlist(
        "user123",
        "test@example.com",
        "Test User"
      );

      // Verify
      expect(result.position).toBe(3); // size + 1
      expect(result.isPaidUser).toBe(false);
      expect(result.priorityScore).toBe(0);
      expect(mocks.mockAddDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          userId: "user123",
          email: "test@example.com",
          displayName: "Test User",
          position: 3,
          isPaidUser: false,
          priorityScore: 0,
          status: "active",
        })
      );
    });

    it("should throw error if user already on waitlist", async () => {
      // Setup - user already exists
      const existingEntry = waitlistTestData.activeUser();
      mocks.mockGetDocs.mockResolvedValue({
        docs: [{ id: "existing-entry", data: () => existingEntry }],
      });

      // Execute & Verify
      await expect(
        service.joinWaitlist("user123", "test@example.com", "Test User")
      ).rejects.toThrow("You are already on the waitlist");
    });

    it("should include metadata when provided", async () => {
      // Setup
      const mockDocRef = { id: "waitlist-entry-123" };
      const mockSnapshot = { size: 0, docs: [] };
      const metadata = { source: "website", referralCode: "REF123" };

      mocks.mockGetDocs.mockResolvedValue(mockSnapshot);
      mocks.mockAddDoc.mockResolvedValue(mockDocRef);

      // Execute
      await service.joinWaitlist(
        "user123",
        "test@example.com",
        "Test User",
        metadata
      );

      // Verify
      expect(mocks.mockAddDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ metadata })
      );
    });
  });

  describe("getWaitlistEntryByUserId", () => {
    it("should return waitlist entry for user", async () => {
      // Setup
      const entry = waitlistTestData.paidUser();
      mocks.mockGetDocs.mockResolvedValue({
        docs: [{ id: entry.id, data: () => entry }],
      });

      // Execute
      const result = await service.getWaitlistEntryByUserId("user123");

      // Verify
      expect(result).toEqual(
        expect.objectContaining({
          id: entry.id,
          userId: "user123",
          isPaidUser: true,
          priorityScore: 1000205,
        })
      );
    });

    it("should return null if no entry found", async () => {
      // Setup
      mocks.mockGetDocs.mockResolvedValue({ docs: [] });

      // Execute
      const result = await service.getWaitlistEntryByUserId("user123");

      // Verify
      expect(result).toBeNull();
    });
  });

  describe("performAction", () => {
    it("should perform referral signup action successfully", async () => {
      // Setup
      const entry = waitlistTestData.activeUser();
      const mockActionDocRef = { id: "action-123" };

      mocks.mockGetDocs.mockResolvedValueOnce({
        docs: [{ id: "waitlist-entry-123", data: () => entry }],
      });
      mocks.mockAddDoc.mockResolvedValue(mockActionDocRef);
      mocks.mockUpdateDoc.mockResolvedValue(undefined);

      // Execute
      await service.performAction("user123", "referral_signup");

      // Verify
      expect(mocks.mockAddDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          type: "referral_signup",
          userId: "user123",
          waitlistEntryId: "waitlist-entry-123",
          points: 5,
          status: "completed",
        })
      );
    });

    it("should throw error if entry not found", async () => {
      // Setup
      mocks.mockGetDocs.mockResolvedValue({ docs: [] });

      // Execute & Verify
      await expect(
        service.performAction("user123", "referral_signup")
      ).rejects.toThrow("Waitlist entry not found");
    });

    it("should throw error for invalid action type", async () => {
      // Setup
      const entry = waitlistTestData.activeUser();
      mocks.mockGetDocs.mockResolvedValueOnce({
        docs: [{ id: "waitlist-entry-123", data: () => entry }],
      });

      // Execute & Verify
      await expect(
        service.performAction("user123", "invalid_action" as any)
      ).rejects.toThrow("Invalid action type");
    });
  });

  describe("recordPayment", () => {
    it("should record payment and update waitlist entry", async () => {
      // Setup
      const entry = waitlistTestData.activeUser();
      const mockPaymentDocRef = { id: "payment-123" };

      mocks.mockGetDocs.mockResolvedValueOnce({
        docs: [{ id: "waitlist-entry-123", data: () => entry }],
      });
      mocks.mockAddDoc.mockResolvedValue(mockPaymentDocRef);
      mocks.mockUpdateDoc.mockResolvedValue(undefined);

      // Execute
      const result = await service.recordPayment(
        "user123",
        "waitlist-entry-123",
        3, // positions
        30, // amount
        "stripe-session-123",
        "payment-intent-123"
      );

      // Verify
      expect(result).toEqual(
        expect.objectContaining({
          id: "payment-123",
          waitlistEntryId: "waitlist-entry-123",
          userId: "user123",
          amount: 30,
          positions: 3,
          status: "completed",
        })
      );

      expect(mocks.mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          paidUpgrades: 3, // 0 + 3
          isPaidUser: true,
          priorityScore: 1000310, // 1000000 + (3 * 100) + 10
        })
      );
    });
  });

  describe("recalculatePositions", () => {
    it("should sort entries by priority score and update positions", async () => {
      // Setup - create test entries with different priority scores
      const entries = [
        waitlistTestData.activeUser(), // 10 points
        waitlistTestData.paidUser(), // 1000205 priority score
        waitlistTestData.highPointsUser(), // 50 points
      ];

      const mockDocs = entries.map((entry) => ({
        id: entry.id,
        ref: { id: entry.id },
        data: () => entry,
      }));

      mocks.mockGetDocs.mockResolvedValue({ docs: mockDocs });
      const mockBatch = setupMockBatch(mocks);

      // Execute
      await service.recalculatePositions();

      // Verify batch operations
      expect(mockBatch.update).toHaveBeenCalledTimes(3);
      expect(mockBatch.commit).toHaveBeenCalled();

      // Verify paid user gets position 1
      expect(mockBatch.update).toHaveBeenCalledWith(
        { id: "waitlist-entry-123" }, // paid user
        expect.objectContaining({
          position: 1,
          priorityScore: 1000205,
        })
      );
    });
  });

  describe("getAvailableActions", () => {
    it("should return active action types", () => {
      const actions = service.getAvailableActions();

      expect(actions).toHaveLength(2);
      expect(actions[0]).toEqual(
        expect.objectContaining({
          id: "referral_signup",
          name: "Invite Friends",
          points: 5,
        })
      );
      expect(actions[1]).toEqual(
        expect.objectContaining({
          id: "payment_upgrade",
          name: "Buy Your Spot",
          cost: 10,
        })
      );
    });
  });

  describe("onWaitlistEntryChange", () => {
    it("should set up real-time listener", () => {
      const mockCallback = jest.fn();
      const mockUnsubscribe = jest.fn();
      const entry = waitlistTestData.activeUser();

      mocks.mockOnSnapshot.mockImplementation((query, callback) => {
        const mockSnapshot = {
          docs: [{ id: entry.id, data: () => entry }],
        };
        callback(mockSnapshot);
        return mockUnsubscribe;
      });

      const unsubscribe = service.onWaitlistEntryChange(
        "user123",
        mockCallback
      );

      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          id: entry.id,
          userId: "user123",
        })
      );
      expect(unsubscribe).toBe(mockUnsubscribe);
    });

    it("should handle empty snapshot", () => {
      const mockCallback = jest.fn();
      const mockUnsubscribe = jest.fn();

      mocks.mockOnSnapshot.mockImplementation((query, callback) => {
        const mockSnapshot = { docs: [] };
        callback(mockSnapshot);
        return mockUnsubscribe;
      });

      service.onWaitlistEntryChange("user123", mockCallback);

      expect(mockCallback).toHaveBeenCalledWith(null);
    });
  });

  describe("cleanup", () => {
    it("should clean up all listeners", () => {
      const mockUnsubscribe1 = jest.fn();
      const mockUnsubscribe2 = jest.fn();

      (service as any).listeners.set("user1", mockUnsubscribe1);
      (service as any).listeners.set("user2", mockUnsubscribe2);

      service.cleanup();

      expect(mockUnsubscribe1).toHaveBeenCalled();
      expect(mockUnsubscribe2).toHaveBeenCalled();
      expect((service as any).listeners.size).toBe(0);
    });
  });
});

// Helper function for setting up mock batch operations
function setupMockBatch(mocks: ReturnType<typeof createFirebaseMocks>) {
  const mockBatch = {
    update: jest.fn(),
    commit: jest.fn().mockResolvedValue(undefined),
  };
  mocks.mockWriteBatch.mockReturnValue(mockBatch);
  return mockBatch;
}
