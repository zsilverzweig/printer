// Admin feature types for Printer

export interface AdminConfig {
  id: string
  waitlistEnabled: boolean
  autoAddToWaitlist: boolean
  waitlistCapacity?: number
  inviteBatchSize: number
  createdAt: Date
  updatedAt: Date
  updatedBy: string
}

export interface WaitlistStats {
  totalEntries: number
  activeEntries: number
  averagePosition: number
  conversionRate: number
  topActions: Array<{
    actionType: string
    count: number
  }>
  dailySignups: Array<{
    date: string
    count: number
  }>
  recentEntries: Array<{
    id: string
    email: string
    position: number
    joinedAt: Date
    totalPoints: number
  }>
}

export interface AdminUser {
  id: string
  email: string
  displayName?: string
  isAdmin: boolean
  createdAt: Date
  lastSignIn?: Date
  waitlistEntry?: {
    position: number
    status: string
    totalPoints: number
  }
}

export interface WaitlistInvite {
  id: string
  waitlistEntryId: string
  userId: string
  email: string
  sentAt: Date
  expiresAt: Date
  status: 'sent' | 'opened' | 'accepted' | 'expired'
  inviteCode: string
}

// Hook return types
export interface UseAdminReturn {
  config: AdminConfig | null
  stats: WaitlistStats | null
  users: AdminUser[]
  loading: boolean
  error: string | null
  updateConfig: (config: Partial<AdminConfig>) => Promise<void>
  sendInvites: (count: number) => Promise<void>
  removeWaitlistEntry: (entryId: string) => Promise<void>
  updateWaitlistEntryStatus: (entryId: string, status: string) => Promise<void>
  refreshStats: () => Promise<void>
}

export interface UseAdminConfigReturn {
  config: AdminConfig | null
  loading: boolean
  error: string | null
  updateConfig: (config: Partial<AdminConfig>) => Promise<void>
  toggleWaitlist: () => Promise<void>
  toggleAutoAdd: () => Promise<void>
}
