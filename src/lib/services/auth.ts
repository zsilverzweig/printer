// Firebase Authentication service for Printer
import {
    GoogleAuthProvider,
    onAuthStateChanged,
    signInWithPopup,
    signOut,
    User,
    UserCredential
} from 'firebase/auth'
import { auth } from './firebase'

// Google Auth Provider
const googleProvider = new GoogleAuthProvider()
googleProvider.addScope('email')
googleProvider.addScope('profile')

export interface AuthUser {
  uid: string
  email: string | null
  displayName: string | null
  photoURL: string | null
  emailVerified: boolean
  isAnonymous: boolean
  metadata: {
    creationTime?: string
    lastSignInTime?: string
  }
}

export class AuthService {
  private currentUser: AuthUser | null = null
  private authStateListeners: Array<(user: AuthUser | null) => void> = []

  constructor() {
    // Listen for auth state changes
    onAuthStateChanged(auth, (user) => {
      this.currentUser = user ? this.mapFirebaseUser(user) : null
      this.notifyListeners()
    })
  }

  /**
   * Sign in with Google
   */
  async signInWithGoogle(): Promise<AuthUser> {
    try {
      const result: UserCredential = await signInWithPopup(auth, googleProvider)
      const user = this.mapFirebaseUser(result.user)
      
      console.log('✅ Google sign-in successful:', user.email)
      
      // Check if auto-add to waitlist is enabled
      await this.handleAutoWaitlist(user)
      
      return user
    } catch (error) {
      console.error('❌ Google sign-in failed:', error)
      throw new Error('Failed to sign in with Google')
    }
  }

  /**
   * Sign out the current user
   */
  async signOutUser(): Promise<void> {
    try {
      await signOut(auth)
      console.log('✅ Sign-out successful')
    } catch (error) {
      console.error('❌ Sign-out failed:', error)
      throw new Error('Failed to sign out')
    }
  }

  /**
   * Get the current user
   */
  getCurrentUser(): AuthUser | null {
    return this.currentUser
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.currentUser !== null
  }

  /**
   * Check if user is admin (based on email domain or specific emails)
   */
  isAdmin(): boolean {
    if (!this.currentUser?.email) return false
    
    // Add your admin email domains or specific emails here
    const adminEmails = [
      'admin@printer.ai',
      'zach@printer.ai',
      // Add more admin emails as needed
    ]
    
    const adminDomains = [
      '@printer.ai',
      // Add more admin domains as needed
    ]
    
    const email = this.currentUser.email.toLowerCase()
    
    // Check specific admin emails
    if (adminEmails.includes(email)) return true
    
    // Check admin domains
    return adminDomains.some(domain => email.endsWith(domain))
  }

  /**
   * Get user's display name or fallback to email
   */
  getDisplayName(): string {
    if (!this.currentUser) return 'Guest'
    return this.currentUser.displayName || this.currentUser.email || 'User'
  }

  /**
   * Get user's profile photo URL
   */
  getPhotoURL(): string | null {
    return this.currentUser?.photoURL || null
  }

  /**
   * Listen for authentication state changes
   */
  onAuthStateChange(callback: (user: AuthUser | null) => void): () => void {
    this.authStateListeners.push(callback)
    
    // Return unsubscribe function
    return () => {
      const index = this.authStateListeners.indexOf(callback)
      if (index > -1) {
        this.authStateListeners.splice(index, 1)
      }
    }
  }

  /**
   * Wait for authentication to be determined
   */
  async waitForAuth(): Promise<AuthUser | null> {
    return new Promise((resolve) => {
      if (this.currentUser !== undefined) {
        resolve(this.currentUser)
        return
      }

      const unsubscribe = this.onAuthStateChange((user) => {
        unsubscribe()
        resolve(user)
      })
    })
  }

  /**
   * Get user's ID token for API requests
   */
  async getIdToken(): Promise<string | null> {
    if (!this.currentUser) return null
    
    try {
      const user = auth.currentUser
      if (!user) return null
      
      return await user.getIdToken()
    } catch (error) {
      console.error('❌ Failed to get ID token:', error)
      return null
    }
  }

  /**
   * Refresh the user's ID token
   */
  async refreshIdToken(): Promise<string | null> {
    if (!this.currentUser) return null
    
    try {
      const user = auth.currentUser
      if (!user) return null
      
      return await user.getIdToken(true) // Force refresh
    } catch (error) {
      console.error('❌ Failed to refresh ID token:', error)
      return null
    }
  }

  /**
   * Handle auto-add to waitlist if enabled
   */
  private async handleAutoWaitlist(user: AuthUser): Promise<void> {
    try {
      // Dynamic import to avoid circular dependency
      const { adminService } = await import('@/features/admin/services/admin-service')
      const { waitlistService } = await import('@/features/waitlist/services/waitlist-service')
      
      // Check if auto-add is enabled
      const isAutoAddEnabled = await adminService.isAutoAddToWaitlistEnabled()
      const isWaitlistEnabled = await adminService.isWaitlistEnabled()
      
      if (isAutoAddEnabled && isWaitlistEnabled && user.email) {
        // Check if user is already on waitlist
        const existingEntry = await waitlistService.getWaitlistEntryByUserId(user.uid)
        
        if (!existingEntry) {
          // Add user to waitlist
          await waitlistService.joinWaitlist(
            user.uid,
            user.email,
            user.displayName || undefined,
            { source: 'auto_signup' }
          )
          console.log('✅ User automatically added to waitlist:', user.email)
        }
      }
    } catch (error) {
      // Don't throw error to avoid breaking sign-in flow
      console.error('❌ Failed to handle auto-waitlist:', error)
    }
  }

  // Private methods

  private mapFirebaseUser(user: User): AuthUser {
    return {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      emailVerified: user.emailVerified,
      isAnonymous: user.isAnonymous,
      metadata: {
        creationTime: user.metadata.creationTime,
        lastSignInTime: user.metadata.lastSignInTime,
      },
    }
  }

  private notifyListeners(): void {
    this.authStateListeners.forEach(callback => {
      try {
        callback(this.currentUser)
      } catch (error) {
        console.error('❌ Error in auth state listener:', error)
      }
    })
  }
}

// Global auth service instance
export const authService = new AuthService()

// Helper functions
export const signInWithGoogle = () => authService.signInWithGoogle()
export const signOutUser = () => authService.signOutUser()
export const getCurrentUser = () => authService.getCurrentUser()
export const isAuthenticated = () => authService.isAuthenticated()
export const isAdmin = () => authService.isAdmin()
export const getDisplayName = () => authService.getDisplayName()
export const getPhotoURL = () => authService.getPhotoURL()
export const onAuthStateChange = (callback: (user: AuthUser | null) => void) => 
  authService.onAuthStateChange(callback)
export const waitForAuth = () => authService.waitForAuth()
export const getIdToken = () => authService.getIdToken()
export const refreshIdToken = () => authService.refreshIdToken()

export default authService
