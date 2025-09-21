// Tests for WaitlistService
import type { ActionTypeId, WaitlistEntry } from "../../types";
import { WaitlistService } from "../waitlist-service";

// Mock Firebase
jest.mock("@/lib/services/firebase", () => ({
  db: {},
}));

// Mock logger
jest.mock("@/lib/utils/logger", () => ({
  log: {
    success: jest.fn(),
    failure: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

// Mock Firebase Firestore functions
jest.mock("firebase/firestore", () => ({
  addDoc: jest.fn(),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  updateDoc: jest.fn(),
  onSnapshot: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  collection: jest.fn(),
  doc: jest.fn(),
  writeBatch: jest.fn(),
  serverTimestamp: jest.fn(() => new Date()),
  increment: jest.fn((value) => ({ increment: value })),
}));

// Import mocked functions
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

// Cast as jest mocks
const mockAddDoc = addDoc as jest.MockedFunction<typeof addDoc>;
const mockGetDoc = getDoc as jest.MockedFunction<typeof getDoc>;
const mockGetDocs = getDocs as jest.MockedFunction<typeof getDocs>;
const mockUpdateDoc = updateDoc as jest.MockedFunction<typeof updateDoc>;
const mockOnSnapshot = onSnapshot as jest.MockedFunction<typeof onSnapshot>;
const mockQuery = query as jest.MockedFunction<typeof query>;
const mockWhere = where as jest.MockedFunction<typeof where>;
const mockCollection = collection as jest.MockedFunction<typeof collection>;
const mockDoc = doc as jest.MockedFunction<typeof doc>;
const mockWriteBatch = writeBatch as jest.MockedFunction<typeof writeBatch>;
const mockServerTimestamp = serverTimestamp as jest.MockedFunction<
  typeof serverTimestamp
>;
const mockIncrement = increment as jest.MockedFunction<typeof increment>;

describe("WaitlistService", () => {
  let service: WaitlistService;
  const mockUserId = "test-user-123";
  const mockEmail = "test@example.com";
  const mockDisplayName = "Test User";

  beforeEach(() => {
    service = WaitlistService.getInstance();
    jest.clearAllMocks();

    // Reset mocks
    mockQuery.mockReturnValue({});
    mockWhere.mockReturnValue({});
    mockCollection.mockReturnValue({});
    mockDoc.mockReturnValue({});
    mockWriteBatch.mockReturnValue({
      update: jest.fn(),
      commit: jest.fn(),
    });
  });

  describe("joinWaitlist", () => {
    it("should successfully join the waitlist", async () => {
      const mockDocRef = { id: "waitlist-entry-123" };
      const mockSnapshot = {
        size: 2,
        docs: [],
      };

      mockGetDocs.mockResolvedValue(mockSnapshot);
      mockAddDoc.mockResolvedValue(mockDocRef);

      const result = await service.joinWaitlist(
        mockUserId,
        mockEmail,
        mockDisplayName
      );

      expect(result).toEqual({
        id: "waitlist-entry-123",
        userId: mockUserId,
        email: mockEmail,
        displayName: mockDisplayName,
        position: 3, // size + 1
        joinedAt: expect.any(Date),
        lastActionAt: undefined,
        totalActions: 0,
        paidUpgrades: 0,
        totalPoints: 0,
        isPaidUser: false,
        priorityScore: 0,
        status: "active",
        metadata: {},
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });

      expect(mockAddDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          userId: mockUserId,
          email: mockEmail,
          displayName: mockDisplayName,
          position: 3,
          isPaidUser: false,
          priorityScore: 0,
          status: "active",
        })
      );
    });

    it("should throw error if user already on waitlist", async () => {
      const mockSnapshot = {
        docs: [{ id: "existing-entry" }],
      };
      mockGetDocs.mockResolvedValue(mockSnapshot);

      await expect(
        service.joinWaitlist(mockUserId, mockEmail, mockDisplayName)
      ).rejects.toThrow("You are already on the waitlist");
    });

    it("should include metadata when provided", async () => {
      const mockDocRef = { id: "waitlist-entry-123" };
      const mockSnapshot = { size: 0, docs: [] };
      const metadata = {
        source: "website",
        referralCode: "REF123",
        userAgent: "Mozilla/5.0",
      };

      mockGetDocs.mockResolvedValue(mockSnapshot);
      mockAddDoc.mockResolvedValue(mockDocRef);

      await service.joinWaitlist(
        mockUserId,
        mockEmail,
        mockDisplayName,
        metadata
      );

      expect(mockAddDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          metadata: metadata,
        })
      );
    });
  });

  describe("getWaitlistEntryByUserId", () => {
    it("should return waitlist entry for user", async () => {
      const mockDoc = {
        id: "waitlist-entry-123",
        data: () => ({
          userId: mockUserId,
          email: mockEmail,
          position: 5,
          totalActions: 2,
          totalPoints: 10,
          paidUpgrades: 1,
          isPaidUser: true,
          priorityScore: 1000100,
          status: "active",
          joinedAt: { toDate: () => new Date("2023-01-01") },
          createdAt: { toDate: () => new Date("2023-01-01") },
          updatedAt: { toDate: () => new Date("2023-01-01") },
          lastActionAt: { toDate: () => new Date("2023-01-02") },
        }),
      };

      const mockSnapshot = {
        empty: false,
        docs: [mockDoc],
      };

      mockGetDocs.mockResolvedValue(mockSnapshot);

      const result = await service.getWaitlistEntryByUserId(mockUserId);

      expect(result).toEqual({
        id: "waitlist-entry-123",
        userId: mockUserId,
        email: mockEmail,
        position: 5,
        totalActions: 2,
        totalPoints: 10,
        paidUpgrades: 1,
        isPaidUser: true,
        priorityScore: 1000100,
        status: "active",
        joinedAt: new Date("2023-01-01"),
        createdAt: new Date("2023-01-01"),
        updatedAt: new Date("2023-01-01"),
        lastActionAt: new Date("2023-01-02"),
      });
    });

    it("should return null if no entry found", async () => {
      const mockSnapshot = { empty: true, docs: [] };
      mockGetDocs.mockResolvedValue(mockSnapshot);

      const result = await service.getWaitlistEntryByUserId(mockUserId);

      expect(result).toBeNull();
    });
  });

  describe("performAction", () => {
    it("should perform referral signup action successfully", async () => {
      const mockEntry: WaitlistEntry = {
        id: "waitlist-entry-123",
        userId: mockUserId,
        email: mockEmail,
        position: 5,
        joinedAt: new Date(),
        totalActions: 1,
        paidUpgrades: 0,
        totalPoints: 5,
        isPaidUser: false,
        priorityScore: 5,
        status: "active",
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockActionDocRef = { id: "action-123" };

      mockGetDocs.mockResolvedValueOnce({
        empty: false,
        docs: [{ id: "waitlist-entry-123", data: () => mockEntry }],
      });
      mockAddDoc.mockResolvedValue(mockActionDocRef);
      mockUpdateDoc.mockResolvedValue(undefined);

      await service.performAction(mockUserId, "referral_signup");

      expect(mockAddDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          type: "referral_signup",
          userId: mockUserId,
          waitlistEntryId: "waitlist-entry-123",
          points: 5,
          status: "completed",
        })
      );

      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          totalActions: expect.anything(),
          totalPoints: expect.anything(),
          lastActionAt: expect.anything(),
          updatedAt: expect.anything(),
        })
      );
    });

    it("should throw error if entry not found", async () => {
      const mockSnapshot = { empty: true, docs: [] };
      mockGetDocs.mockResolvedValue(mockSnapshot);

      await expect(
        service.performAction(mockUserId, "referral_signup")
      ).rejects.toThrow("Waitlist entry not found");
    });

    it("should throw error for invalid action type", async () => {
      const mockEntry = {
        id: "waitlist-entry-123",
        userId: mockUserId,
      };

      mockGetDocs.mockResolvedValueOnce({
        empty: false,
        docs: [{ id: "waitlist-entry-123", data: () => mockEntry }],
      });

      await expect(
        service.performAction(mockUserId, "invalid_action" as ActionTypeId)
      ).rejects.toThrow("Invalid action type");
    });
  });

  describe("recordPayment", () => {
    it("should record payment and update waitlist entry", async () => {
      const mockEntry: WaitlistEntry = {
        id: "waitlist-entry-123",
        userId: mockUserId,
        email: mockEmail,
        position: 10,
        joinedAt: new Date(),
        totalActions: 2,
        paidUpgrades: 0,
        totalPoints: 10,
        isPaidUser: false,
        priorityScore: 10,
        status: "active",
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockPaymentDocRef = { id: "payment-123" };

      mockGetDocs.mockResolvedValueOnce({
        empty: false,
        docs: [{ id: "waitlist-entry-123", data: () => mockEntry }],
      });
      mockAddDoc.mockResolvedValue(mockPaymentDocRef);
      mockUpdateDoc.mockResolvedValue(undefined);

      const result = await service.recordPayment(
        mockUserId,
        "waitlist-entry-123",
        3, // positions
        30, // amount
        "stripe-session-123",
        "payment-intent-123"
      );

      expect(result).toEqual({
        id: "payment-123",
        waitlistEntryId: "waitlist-entry-123",
        userId: mockUserId,
        amount: 30,
        positions: 3,
        status: "completed",
        stripeSessionId: "stripe-session-123",
        paymentIntentId: "payment-intent-123",
        completedAt: expect.any(Date),
        createdAt: expect.any(Date),
      });

      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          paidUpgrades: 3, // 0 + 3
          totalPoints: expect.anything(),
          isPaidUser: true,
          priorityScore: 1000300, // 1000000 + (3 * 100) + 10
          lastActionAt: expect.anything(),
          updatedAt: expect.anything(),
        })
      );
    });
  });

  describe("recalculatePositions", () => {
    it("should sort entries by priority score and update positions", async () => {
      const mockDocs = [
        {
          id: "entry-1",
          ref: { id: "entry-1" },
          data: () => ({
            isPaidUser: false,
            paidUpgrades: 0,
            totalPoints: 10,
            joinedAt: { toMillis: () => 1000 },
          }),
        },
        {
          id: "entry-2",
          ref: { id: "entry-2" },
          data: () => ({
            isPaidUser: true,
            paidUpgrades: 2,
            totalPoints: 5,
            joinedAt: { toMillis: () => 2000 },
          }),
        },
        {
          id: "entry-3",
          ref: { id: "entry-3" },
          data: () => ({
            isPaidUser: false,
            paidUpgrades: 0,
            totalPoints: 20,
            joinedAt: { toMillis: () => 500 },
          }),
        },
      ];

      const mockSnapshot = { docs: mockDocs };
      mockGetDocs.mockResolvedValue(mockSnapshot);

      const mockBatch = {
        update: jest.fn(),
        commit: jest.fn(),
      };
      mockWriteBatch.mockReturnValue(mockBatch);

      await service.recalculatePositions();

      // Verify batch updates were called
      expect(mockBatch.update).toHaveBeenCalledTimes(3);
      expect(mockBatch.commit).toHaveBeenCalled();

      // Verify position updates (paid user should be first)
      expect(mockBatch.update).toHaveBeenCalledWith(
        { id: "entry-2" },
        expect.objectContaining({
          position: 1,
          priorityScore: 1000205, // 1000000 + (2 * 100) + 5
        })
      );
    });
  });

  describe("getAvailableActions", () => {
    it("should return active action types", () => {
      const actions = service.getAvailableActions();

      expect(actions).toHaveLength(2);
      expect(actions[0]).toEqual({
        id: "referral_signup",
        name: "Invite Friends",
        description: "Get friends to join the waitlist to move up 5 positions",
        points: 5,
        isActive: true,
        category: "referral",
        icon: "users",
      });
      expect(actions[1]).toEqual({
        id: "payment_upgrade",
        name: "Buy Your Spot",
        description: "Pay to move up in the waitlist",
        points: 0,
        cost: 10,
        isActive: true,
        category: "payment",
        icon: "credit-card",
      });
    });
  });

  describe("onWaitlistEntryChange", () => {
    it("should set up real-time listener", () => {
      const mockCallback = jest.fn();
      const mockUnsubscribe = jest.fn();

      mockOnSnapshot.mockImplementation((query, callback) => {
        // Simulate snapshot with data
        const mockSnapshot = {
          empty: false,
          docs: [
            {
              id: "waitlist-entry-123",
              data: () => ({
                userId: mockUserId,
                email: mockEmail,
                position: 5,
                totalActions: 2,
                totalPoints: 10,
                paidUpgrades: 0,
                isPaidUser: false,
                priorityScore: 10,
                status: "active",
                joinedAt: { toDate: () => new Date() },
                createdAt: { toDate: () => new Date() },
                updatedAt: { toDate: () => new Date() },
                lastActionAt: null,
              }),
            },
          ],
        };
        callback(mockSnapshot);
        return mockUnsubscribe;
      });

      const unsubscribe = service.onWaitlistEntryChange(
        mockUserId,
        mockCallback
      );

      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "waitlist-entry-123",
          userId: mockUserId,
          email: mockEmail,
          position: 5,
        })
      );

      expect(unsubscribe).toBe(mockUnsubscribe);
    });

    it("should handle empty snapshot", () => {
      const mockCallback = jest.fn();
      const mockUnsubscribe = jest.fn();

      mockOnSnapshot.mockImplementation((query, callback) => {
        const mockSnapshot = { empty: true, docs: [] };
        callback(mockSnapshot);
        return mockUnsubscribe;
      });

      service.onWaitlistEntryChange(mockUserId, mockCallback);

      expect(mockCallback).toHaveBeenCalledWith(null);
    });
  });

  describe("cleanup", () => {
    it("should clean up all listeners", () => {
      const mockUnsubscribe1 = jest.fn();
      const mockUnsubscribe2 = jest.fn();

      // Add some mock listeners
      (service as any).listeners.set("user1", mockUnsubscribe1);
      (service as any).listeners.set("user2", mockUnsubscribe2);

      service.cleanup();

      expect(mockUnsubscribe1).toHaveBeenCalled();
      expect(mockUnsubscribe2).toHaveBeenCalled();
      expect((service as any).listeners.size).toBe(0);
    });
  });
});
