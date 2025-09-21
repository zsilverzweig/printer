// Admin service for managing waitlist and system configuration
import { waitlistService } from '@/features/waitlist/services/waitlist-service'
import { db } from '@/lib/services/firebase'
import {
    collection,
    doc,
    getDoc,
    getDocs,
    limit,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    updateDoc,
    where,
    writeBatch
} from 'firebase/firestore'
import type {
    AdminConfig,
    WaitlistStats
} from '../types'

// Collection names
const COLLECTIONS = {
  ADMIN_CONFIG: 'admin_config',
  WAITLIST_ENTRIES: 'waitlist_entries',
  WAITLIST_ACTIONS: 'waitlist_actions',
  WAITLIST_PAYMENTS: 'waitlist_payments'
} as const

// Default admin configuration
const DEFAULT_ADMIN_CONFIG: Omit<AdminConfig, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'> = {
  waitlistEnabled: true,
  autoAddToWaitlist: false,
  waitlistCapacity: 1000,
  inviteBatchSize: 10
}

export class AdminService {
  private static instance: AdminService

  static getInstance(): AdminService {
    if (!AdminService.instance) {
      AdminService.instance = new AdminService()
    }
    return AdminService.instance
  }

  /**
   * Get admin configuration
   */
  async getAdminConfig(): Promise<AdminConfig> {
    try {
      const docRef = doc(db, COLLECTIONS.ADMIN_CONFIG, 'main')
      const docSnap = await getDoc(docRef)
      
      if (docSnap.exists()) {
        const data = docSnap.data()
        return {
          id: docSnap.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date()
        } as AdminConfig
      }

      // Create default config if none exists
      const defaultConfig = {
        ...DEFAULT_ADMIN_CONFIG,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: 'system'
      }

      await setDoc(docRef, defaultConfig)
      
      return {
        id: docRef.id,
        ...defaultConfig,
        createdAt: new Date(),
        updatedAt: new Date()
      } as AdminConfig
    } catch (error) {
      console.error('❌ Failed to get admin config:', error)
      throw error
    }
  }

  /**
   * Update admin configuration
   */
  async updateAdminConfig(
    updates: Partial<AdminConfig>,
    updatedBy: string
  ): Promise<void> {
    try {
      const docRef = doc(db, COLLECTIONS.ADMIN_CONFIG, 'main')
      
      await updateDoc(docRef, {
        ...updates,
        updatedAt: serverTimestamp(),
        updatedBy
      })
    } catch (error) {
      console.error('❌ Failed to update admin config:', error)
      throw error
    }
  }

  /**
   * Toggle waitlist enabled/disabled
   */
  async toggleWaitlist(updatedBy: string): Promise<void> {
    try {
      const config = await this.getAdminConfig()
      await this.updateAdminConfig(
        { waitlistEnabled: !config.waitlistEnabled },
        updatedBy
      )
    } catch (error) {
      console.error('❌ Failed to toggle waitlist:', error)
      throw error
    }
  }

  /**
   * Toggle auto-add to waitlist
   */
  async toggleAutoAddToWaitlist(updatedBy: string): Promise<void> {
    try {
      const config = await this.getAdminConfig()
      await this.updateAdminConfig(
        { autoAddToWaitlist: !config.autoAddToWaitlist },
        updatedBy
      )
    } catch (error) {
      console.error('❌ Failed to toggle auto-add to waitlist:', error)
      throw error
    }
  }

  /**
   * Get waitlist statistics
   */
  async getWaitlistStats(): Promise<WaitlistStats> {
    try {
      // Get total entries
      const entriesQuery = query(
        collection(db, COLLECTIONS.WAITLIST_ENTRIES),
        where('status', '==', 'active')
      )
      const entriesSnapshot = await getDocs(entriesQuery)
      const totalEntries = entriesSnapshot.size

      // Get recent entries (last 7 days)
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      
      const recentEntriesQuery = query(
        collection(db, COLLECTIONS.WAITLIST_ENTRIES),
        where('status', '==', 'active'),
        where('joinedAt', '>=', sevenDaysAgo),
        orderBy('joinedAt', 'desc'),
        limit(10)
      )
      const recentSnapshot = await getDocs(recentEntriesQuery)
      
      const recentEntries = recentSnapshot.docs.map(doc => ({
        id: doc.id,
        email: doc.data().email,
        position: doc.data().position,
        joinedAt: doc.data().joinedAt?.toDate() || new Date(),
        totalPoints: doc.data().totalPoints || 0
      }))

      // Get top actions
      const actionsQuery = query(
        collection(db, COLLECTIONS.WAITLIST_ACTIONS),
        where('status', '==', 'completed')
      )
      const actionsSnapshot = await getDocs(actionsQuery)
      
      const actionCounts: Record<string, number> = {}
      actionsSnapshot.docs.forEach(doc => {
        const actionType = doc.data().type
        actionCounts[actionType] = (actionCounts[actionType] || 0) + 1
      })

      const topActions = Object.entries(actionCounts)
        .map(([actionType, count]) => ({ actionType, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)

      // Calculate average position
      let totalPosition = 0
      entriesSnapshot.docs.forEach(doc => {
        totalPosition += doc.data().position || 0
      })
      const averagePosition = totalEntries > 0 ? Math.round(totalPosition / totalEntries) : 0

      // Get daily signups (last 7 days)
      const dailySignups = []
      for (let i = 6; i >= 0; i--) {
        const date = new Date()
        date.setDate(date.getDate() - i)
        const startOfDay = new Date(date)
        startOfDay.setHours(0, 0, 0, 0)
        const endOfDay = new Date(date)
        endOfDay.setHours(23, 59, 59, 999)

        const dayQuery = query(
          collection(db, COLLECTIONS.WAITLIST_ENTRIES),
          where('status', '==', 'active'),
          where('joinedAt', '>=', startOfDay),
          where('joinedAt', '<=', endOfDay)
        )
        const daySnapshot = await getDocs(dayQuery)
        
        dailySignups.push({
          date: date.toISOString().split('T')[0],
          count: daySnapshot.size
        })
      }

      return {
        totalEntries,
        activeEntries: totalEntries,
        averagePosition,
        conversionRate: 0, // TODO: Calculate based on invites sent vs accepted
        topActions,
        dailySignups,
        recentEntries
      }
    } catch (error) {
      console.error('❌ Failed to get waitlist stats:', error)
      throw error
    }
  }

  /**
   * Get all waitlist entries
   */
  async getAllWaitlistEntries(): Promise<any[]> {
    try {
      const entriesQuery = query(
        collection(db, COLLECTIONS.WAITLIST_ENTRIES),
        orderBy('position', 'asc')
      )
      const snapshot = await getDocs(entriesQuery)
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        joinedAt: doc.data().joinedAt?.toDate() || new Date(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate() || new Date(),
        lastActionAt: doc.data().lastActionAt?.toDate()
      }))
    } catch (error) {
      console.error('❌ Failed to get waitlist entries:', error)
      throw error
    }
  }

  /**
   * Remove a waitlist entry
   */
  async removeWaitlistEntry(entryId: string): Promise<void> {
    try {
      const docRef = doc(db, COLLECTIONS.WAITLIST_ENTRIES, entryId)
      await updateDoc(docRef, {
        status: 'cancelled',
        updatedAt: serverTimestamp()
      })
      
      // Recalculate positions
      await waitlistService.recalculatePositions()
    } catch (error) {
      console.error('❌ Failed to remove waitlist entry:', error)
      throw error
    }
  }

  /**
   * Update waitlist entry status
   */
  async updateWaitlistEntryStatus(
    entryId: string,
    status: 'active' | 'invited' | 'converted' | 'cancelled'
  ): Promise<void> {
    try {
      const docRef = doc(db, COLLECTIONS.WAITLIST_ENTRIES, entryId)
      await updateDoc(docRef, {
        status,
        updatedAt: serverTimestamp()
      })
      
      // Recalculate positions if status changed to/from active
      if (status === 'active' || status === 'cancelled') {
        await waitlistService.recalculatePositions()
      }
    } catch (error) {
      console.error('❌ Failed to update waitlist entry status:', error)
      throw error
    }
  }

  /**
   * Send invites to top waitlist entries
   */
  async sendInvites(count: number): Promise<void> {
    try {
      const entriesQuery = query(
        collection(db, COLLECTIONS.WAITLIST_ENTRIES),
        where('status', '==', 'active'),
        orderBy('position', 'asc'),
        limit(count)
      )
      
      const snapshot = await getDocs(entriesQuery)
      const batch = writeBatch(db)
      
      snapshot.docs.forEach(doc => {
        batch.update(doc.ref, {
          status: 'invited',
          updatedAt: serverTimestamp()
        })
      })
      
      await batch.commit()
      
      // Recalculate positions
      await waitlistService.recalculatePositions()
    } catch (error) {
      console.error('❌ Failed to send invites:', error)
      throw error
    }
  }

  /**
   * Check if auto-add to waitlist is enabled
   */
  async isAutoAddToWaitlistEnabled(): Promise<boolean> {
    try {
      const config = await this.getAdminConfig()
      return config.autoAddToWaitlist
    } catch (error) {
      console.error('❌ Failed to check auto-add setting:', error)
      return false
    }
  }

  /**
   * Check if waitlist is enabled
   */
  async isWaitlistEnabled(): Promise<boolean> {
    try {
      const config = await this.getAdminConfig()
      return config.waitlistEnabled
    } catch (error) {
      console.error('❌ Failed to check waitlist setting:', error)
      return false
    }
  }
}

// Export singleton instance
export const adminService = AdminService.getInstance()
