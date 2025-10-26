// Waitlist service for Firebase integration
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

import { db } from "@/lib/services/firebase";
import { log } from "@/lib/utils/logger";

import type {
  ActionTypeId,
  WaitlistConfig,
  WaitlistEntry,
  WaitlistPayment,
} from "../types";

// Collection names
const COLLECTIONS = {
  WAITLIST_ENTRIES: "waitlist_entries",
  WAITLIST_ACTIONS: "waitlist_actions",
  WAITLIST_PAYMENTS: "waitlist_payments",
  WAITLIST_CONFIG: "waitlist_config",
} as const;

// Default action types
const DEFAULT_ACTION_TYPES = [
  {
    id: "referral_signup" as ActionTypeId,
    name: "Invite Friends",
    description: "Get friends to join the waitlist to move up 5 positions",
    points: 5,
    isActive: true,
    category: "referral" as const,
    icon: "users",
  },
  {
    id: "payment_upgrade" as ActionTypeId,
    name: "Buy Your Spot",
    description: "Pay to move up in the waitlist",
    points: 0, // Points calculated based on payment
    cost: 10, // $10 per position
    isActive: true,
    category: "payment" as const,
    icon: "credit-card",
  },
];

export class WaitlistService {
  private static instance: WaitlistService;
  private listeners: Map<string, () => void> = new Map();

  static getInstance(): WaitlistService {
    if (!WaitlistService.instance) {
      WaitlistService.instance = new WaitlistService();
    }
    return WaitlistService.instance;
  }

  /**
   * Join the waitlist
   */
  async joinWaitlist(
    userId: string,
    email: string,
    displayName?: string,
    metadata?: Record<string, unknown>
  ): Promise<WaitlistEntry> {
    try {
      // Check if user is already on waitlist
      const existingEntry = await this.getWaitlistEntryByUserId(userId);
      if (existingEntry) {
        throw new Error("You are already on the waitlist");
      }

      // Get current waitlist count to determine position
      const entriesQuery = query(
        collection(db, COLLECTIONS.WAITLIST_ENTRIES),
        where("status", "==", "active")
      );
      const snapshot = await getDocs(entriesQuery);
      const position = snapshot.size + 1;

      // Create waitlist entry
      const entryData = {
        userId,
        email,
        displayName,
        position,
        joinedAt: serverTimestamp(),
        lastActionAt: null,
        totalActions: 0,
        paidUpgrades: 0,
        totalPoints: 0,
        isPaidUser: false,
        priorityScore: 0,
        status: "active" as const,
        metadata: metadata || {},
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const docRef = await addDoc(
        collection(db, COLLECTIONS.WAITLIST_ENTRIES),
        entryData
      );

      return {
        id: docRef.id,
        ...entryData,
        joinedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        lastActionAt: undefined,
      } as WaitlistEntry;
    } catch (error) {
      log.failure("Failed to join waitlist", error, "WaitlistService");
      throw error;
    }
  }

  /**
   * Get waitlist entry by user ID
   */
  async getWaitlistEntryByUserId(
    userId: string
  ): Promise<WaitlistEntry | null> {
    try {
      const q = query(
        collection(db, COLLECTIONS.WAITLIST_ENTRIES),
        where("userId", "==", userId)
      );
      const snapshot = await getDocs(q);

      if (snapshot.empty) return null;

      const doc = snapshot.docs[0];
      return {
        id: doc.id,
        ...doc.data(),
        joinedAt: doc.data().joinedAt?.toDate() || new Date(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate() || new Date(),
        lastActionAt: doc.data().lastActionAt?.toDate(),
      } as WaitlistEntry;
    } catch (error) {
      log.failure("Failed to get waitlist entry", error, "WaitlistService");
      throw error;
    }
  }

  /**
   * Perform a waitlist action
   */
  async performAction(
    userId: string,
    actionType: ActionTypeId,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    try {
      const entry = await this.getWaitlistEntryByUserId(userId);
      if (!entry) {
        throw new Error("Waitlist entry not found");
      }

      const actionTypeConfig = DEFAULT_ACTION_TYPES.find(
        (a) => a.id === actionType
      );
      if (!actionTypeConfig) {
        throw new Error("Invalid action type");
      }

      // Create action record
      const actionData = {
        type: actionType,
        userId,
        waitlistEntryId: entry.id,
        points: actionTypeConfig.points,
        completedAt: serverTimestamp(),
        status: "completed" as const,
        metadata: metadata || {},
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(db, COLLECTIONS.WAITLIST_ACTIONS), actionData);

      // Update waitlist entry
      await updateDoc(doc(db, COLLECTIONS.WAITLIST_ENTRIES, entry.id), {
        totalActions: increment(1),
        totalPoints: increment(actionTypeConfig.points),
        lastActionAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Recalculate positions
      await this.recalculatePositions();
    } catch (error) {
      log.failure("Failed to perform action", error, "WaitlistService");
      throw error;
    }
  }

  /**
   * Record a payment from Stripe webhook
   */
  async recordPayment(
    userId: string,
    waitlistEntryId: string,
    positions: number,
    amount: number,
    stripeSessionId: string,
    paymentIntentId: string
  ): Promise<WaitlistPayment> {
    try {
      const entry = await this.getWaitlistEntryByUserId(userId);
      if (!entry) {
        throw new Error("Waitlist entry not found");
      }

      // Create payment record
      const paymentData = {
        waitlistEntryId,
        userId,
        amount,
        positions,
        status: "completed" as const,
        stripeSessionId,
        paymentIntentId,
        completedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      };

      const docRef = await addDoc(
        collection(db, COLLECTIONS.WAITLIST_PAYMENTS),
        paymentData
      );

      // Update waitlist entry to mark as paid user and add upgrades
      const newPaidUpgrades = (entry.paidUpgrades || 0) + positions;
      const newPriorityScore =
        1000000 + newPaidUpgrades * 100 + entry.totalPoints;

      await updateDoc(doc(db, COLLECTIONS.WAITLIST_ENTRIES, entry.id), {
        paidUpgrades: newPaidUpgrades,
        totalPoints: increment(positions), // 1 point per position
        isPaidUser: true,
        priorityScore: newPriorityScore,
        lastActionAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Recalculate positions
      await this.recalculatePositions();

      return {
        id: docRef.id,
        ...paymentData,
        completedAt: new Date(),
        createdAt: new Date(),
      } as WaitlistPayment;
    } catch (error) {
      log.failure("Failed to record payment", error, "WaitlistService");
      throw error;
    }
  }

  /**
   * Purchase position upgrade (creates Stripe checkout session)
   */
  async purchaseUpgrade(
    userId: string,
    positions: number,
    amount: number
  ): Promise<{ sessionId: string; url: string }> {
    try {
      const entry = await this.getWaitlistEntryByUserId(userId);
      if (!entry) {
        throw new Error("Waitlist entry not found");
      }

      // Import stripe service dynamically to avoid circular dependency
      const { stripeService } = await import("@/lib/services/stripe");

      // Create checkout session
      const result = await stripeService.createCheckoutSession({
        userId,
        waitlistEntryId: entry.id,
        positions,
        amount,
        successUrl: `${window.location.origin}/waitlist?payment=success`,
        cancelUrl: `${window.location.origin}/waitlist?payment=cancelled`,
      });

      return result;
    } catch (error) {
      log.failure("Failed to purchase upgrade", error, "WaitlistService");
      throw error;
    }
  }

  /**
   * Get available actions for user
   */
  getAvailableActions(): typeof DEFAULT_ACTION_TYPES {
    return DEFAULT_ACTION_TYPES.filter((action) => action.isActive);
  }

  /**
   * Get waitlist configuration
   */
  async getWaitlistConfig(): Promise<WaitlistConfig> {
    try {
      const docRef = doc(db, COLLECTIONS.WAITLIST_CONFIG, "main");
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        return docSnap.data() as WaitlistConfig;
      }

      // Return default config if none exists
      return {
        isOpen: true,
        inviteBatchSize: 10,
        actionTypes: DEFAULT_ACTION_TYPES,
        pointsPerPosition: 1,
        paymentOptions: {
          enabled: true,
          pricePerPosition: 10,
          maxPositionsPerPurchase: 10,
        },
      };
    } catch (error) {
      log.failure("Failed to get waitlist config", error, "WaitlistService");
      throw error;
    }
  }

  /**
   * Recalculate all waitlist positions based on points
   */
  async recalculatePositions(): Promise<void> {
    try {
      // Get all active entries (simple query, no composite index needed)
      const entriesQuery = query(
        collection(db, COLLECTIONS.WAITLIST_ENTRIES),
        where("status", "==", "active")
      );

      const snapshot = await getDocs(entriesQuery);

      // Sort client-side to avoid composite index requirement
      const entries = snapshot.docs.map((doc) => {
        const data = doc.data();
        const isPaidUser = data.isPaidUser || false;
        const paidUpgrades = data.paidUpgrades || 0;
        const totalPoints = data.totalPoints || 0;

        // Calculate priority score: paid users get massive boost
        const priorityScore = isPaidUser
          ? 1000000 + paidUpgrades * 100 + totalPoints
          : totalPoints;

        return {
          id: doc.id,
          ref: doc.ref,
          totalPoints,
          paidUpgrades,
          isPaidUser,
          priorityScore,
          joinedAt: data.joinedAt || new Date(),
        };
      });

      // Sort by priorityScore desc, then by joinedAt asc
      entries.sort((a, b) => {
        if (b.priorityScore !== a.priorityScore) {
          return b.priorityScore - a.priorityScore;
        }
        return a.joinedAt.toMillis() - b.joinedAt.toMillis();
      });

      // Update positions in batches
      const batch = writeBatch(db);
      entries.forEach((entry, index) => {
        const newPosition = index + 1;
        batch.update(entry.ref, {
          position: newPosition,
          priorityScore: entry.priorityScore,
          updatedAt: serverTimestamp(),
        });
      });

      await batch.commit();
    } catch (error) {
      log.failure("Failed to recalculate positions", error, "WaitlistService");
      throw error;
    }
  }

  /**
   * Listen to waitlist entry changes
   */
  onWaitlistEntryChange(
    userId: string,
    callback: (entry: WaitlistEntry | null) => void
  ): () => void {
    const q = query(
      collection(db, COLLECTIONS.WAITLIST_ENTRIES),
      where("userId", "==", userId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        callback(null);
        return;
      }

      const doc = snapshot.docs[0];
      const entry = {
        id: doc.id,
        ...doc.data(),
        joinedAt: doc.data().joinedAt?.toDate() || new Date(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate() || new Date(),
        lastActionAt: doc.data().lastActionAt?.toDate(),
      } as WaitlistEntry;

      callback(entry);
    });

    this.listeners.set(userId, unsubscribe);
    return unsubscribe;
  }

  /**
   * Clean up listeners
   */
  cleanup(): void {
    this.listeners.forEach((unsubscribe) => unsubscribe());
    this.listeners.clear();
  }
}

// Export singleton instance
export const waitlistService = WaitlistService.getInstance();
