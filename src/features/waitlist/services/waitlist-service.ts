// Waitlist service for Firebase integration
import { db } from '@/lib/services/firebase'
import {
    addDoc,
    collection,
    doc,
    getDoc,
    getDocs,
    increment,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    updateDoc,
    where,
    writeBatch
} from 'firebase/firestore'
import type {
    ActionTypeId,
    WaitlistConfig,
    WaitlistEntry,
    WaitlistPayment
} from '../types'

// Collection names
const COLLECTIONS = {
  WAITLIST_ENTRIES: 'waitlist_entries',
  WAITLIST_ACTIONS: 'waitlist_actions',
  WAITLIST_PAYMENTS: 'waitlist_payments',
  WAITLIST_CONFIG: 'waitlist_config'
} as const

// Default action types
const DEFAULT_ACTION_TYPES = [
  {
    id: 'social_share_twitter' as ActionTypeId,
    name: 'Share on Twitter',
    description: 'Share Printer on Twitter to move up 2 positions',
    points: 2,
    isActive: true,
    category: 'social' as const,
    icon: 'twitter'
  },
  {
    id: 'social_share_linkedin' as ActionTypeId,
    name: 'Share on LinkedIn',
    description: 'Share Printer on LinkedIn to move up 3 positions',
    points: 3,
    isActive: true,
    category: 'social' as const,
    icon: 'linkedin'
  },
  {
    id: 'referral_signup' as ActionTypeId,
    name: 'Refer a Friend',
    description: 'Get a friend to join the waitlist to move up 5 positions',
    points: 5,
    isActive: true,
    category: 'referral' as const,
    icon: 'users'
  },
  {
    id: 'payment_upgrade' as ActionTypeId,
    name: 'Purchase Position Upgrade',
    description: 'Pay to move up in the waitlist',
    points: 0, // Points calculated based on payment
    cost: 10, // $10 per position
    isActive: true,
    category: 'payment' as const,
    icon: 'credit-card'
  }
]

export class WaitlistService {
  private static instance: WaitlistService
  private listeners: Map<string, () => void> = new Map()

  static getInstance(): WaitlistService {
    if (!WaitlistService.instance) {
      WaitlistService.instance = new WaitlistService()
    }
    return WaitlistService.instance
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
      const existingEntry = await this.getWaitlistEntryByUserId(userId)
      if (existingEntry) {
        throw new Error('You are already on the waitlist')
      }

      // Get current waitlist count to determine position
      const entriesQuery = query(
        collection(db, COLLECTIONS.WAITLIST_ENTRIES),
        where('status', '==', 'active')
      )
      const snapshot = await getDocs(entriesQuery)
      const position = snapshot.size + 1

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
        status: 'active' as const,
        metadata: metadata || {},
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }

      const docRef = await addDoc(collection(db, COLLECTIONS.WAITLIST_ENTRIES), entryData)
      
      return {
        id: docRef.id,
        ...entryData,
        joinedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        lastActionAt: undefined
      } as WaitlistEntry
    } catch (error) {
      console.error('❌ Failed to join waitlist:', error)
      throw error
    }
  }

  /**
   * Get waitlist entry by user ID
   */
  async getWaitlistEntryByUserId(userId: string): Promise<WaitlistEntry | null> {
    try {
      const q = query(
        collection(db, COLLECTIONS.WAITLIST_ENTRIES),
        where('userId', '==', userId)
      )
      const snapshot = await getDocs(q)
      
      if (snapshot.empty) return null
      
      const doc = snapshot.docs[0]
      return {
        id: doc.id,
        ...doc.data(),
        joinedAt: doc.data().joinedAt?.toDate() || new Date(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate() || new Date(),
        lastActionAt: doc.data().lastActionAt?.toDate()
      } as WaitlistEntry
    } catch (error) {
      console.error('❌ Failed to get waitlist entry:', error)
      throw error
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
      const entry = await this.getWaitlistEntryByUserId(userId)
      if (!entry) {
        throw new Error('Waitlist entry not found')
      }

      const actionTypeConfig = DEFAULT_ACTION_TYPES.find(a => a.id === actionType)
      if (!actionTypeConfig) {
        throw new Error('Invalid action type')
      }

      // Create action record
      const actionData = {
        type: actionType,
        userId,
        waitlistEntryId: entry.id,
        points: actionTypeConfig.points,
        completedAt: serverTimestamp(),
        status: 'completed' as const,
        metadata: metadata || {},
        createdAt: serverTimestamp()
      }

      await addDoc(collection(db, COLLECTIONS.WAITLIST_ACTIONS), actionData)

      // Update waitlist entry
      await updateDoc(doc(db, COLLECTIONS.WAITLIST_ENTRIES, entry.id), {
        totalActions: increment(1),
        totalPoints: increment(actionTypeConfig.points),
        lastActionAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })

      // Recalculate positions
      await this.recalculatePositions()
    } catch (error) {
      console.error('❌ Failed to perform action:', error)
      throw error
    }
  }

  /**
   * Purchase position upgrade (placeholder implementation)
   */
  async purchaseUpgrade(
    userId: string,
    positions: number,
    amount: number
  ): Promise<WaitlistPayment> {
    try {
      const entry = await this.getWaitlistEntryByUserId(userId)
      if (!entry) {
        throw new Error('Waitlist entry not found')
      }

      // Create payment record (placeholder - no actual payment processing)
      const paymentData = {
        waitlistEntryId: entry.id,
        userId,
        amount,
        positions,
        status: 'completed' as const, // Placeholder - always succeeds
        paymentIntentId: `pi_${Date.now()}`, // Placeholder ID
        completedAt: serverTimestamp(),
        createdAt: serverTimestamp()
      }

      const docRef = await addDoc(collection(db, COLLECTIONS.WAITLIST_PAYMENTS), paymentData)

      // Update waitlist entry
      await updateDoc(doc(db, COLLECTIONS.WAITLIST_ENTRIES, entry.id), {
        paidUpgrades: increment(positions),
        totalPoints: increment(positions), // 1 point per position
        lastActionAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })

      // Recalculate positions
      await this.recalculatePositions()

      return {
        id: docRef.id,
        ...paymentData,
        completedAt: new Date(),
        createdAt: new Date()
      } as WaitlistPayment
    } catch (error) {
      console.error('❌ Failed to purchase upgrade:', error)
      throw error
    }
  }

  /**
   * Get available actions for user
   */
  getAvailableActions(): typeof DEFAULT_ACTION_TYPES {
    return DEFAULT_ACTION_TYPES.filter(action => action.isActive)
  }

  /**
   * Get waitlist configuration
   */
  async getWaitlistConfig(): Promise<WaitlistConfig> {
    try {
      const docRef = doc(db, COLLECTIONS.WAITLIST_CONFIG, 'main')
      const docSnap = await getDoc(docRef)
      
      if (docSnap.exists()) {
        return docSnap.data() as WaitlistConfig
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
          maxPositionsPerPurchase: 10
        }
      }
    } catch (error) {
      console.error('❌ Failed to get waitlist config:', error)
      throw error
    }
  }

  /**
   * Recalculate all waitlist positions based on points
   */
  async recalculatePositions(): Promise<void> {
    try {
      const entriesQuery = query(
        collection(db, COLLECTIONS.WAITLIST_ENTRIES),
        where('status', '==', 'active'),
        orderBy('totalPoints', 'desc'),
        orderBy('joinedAt', 'asc')
      )
      
      const snapshot = await getDocs(entriesQuery)
      const batch = writeBatch(db)
      
      snapshot.docs.forEach((doc, index) => {
        const newPosition = index + 1
        batch.update(doc.ref, {
          position: newPosition,
          updatedAt: serverTimestamp()
        })
      })
      
      await batch.commit()
    } catch (error) {
      console.error('❌ Failed to recalculate positions:', error)
      throw error
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
      where('userId', '==', userId)
    )

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        callback(null)
        return
      }

      const doc = snapshot.docs[0]
      const entry = {
        id: doc.id,
        ...doc.data(),
        joinedAt: doc.data().joinedAt?.toDate() || new Date(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate() || new Date(),
        lastActionAt: doc.data().lastActionAt?.toDate()
      } as WaitlistEntry

      callback(entry)
    })

    this.listeners.set(userId, unsubscribe)
    return unsubscribe
  }

  /**
   * Clean up listeners
   */
  cleanup(): void {
    this.listeners.forEach(unsubscribe => unsubscribe())
    this.listeners.clear()
  }
}

// Export singleton instance
export const waitlistService = WaitlistService.getInstance()
