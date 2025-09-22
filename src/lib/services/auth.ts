// Firebase Authentication service for Printer
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
  UserCredential,
} from "firebase/auth";

import { log } from "@/lib/utils/logger";

import { auth } from "./firebase";

// Google Auth Provider
const googleProvider = new GoogleAuthProvider();
googleProvider.addScope("email");
googleProvider.addScope("profile");

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  isAnonymous: boolean;
  metadata: {
    creationTime?: string;
    lastSignInTime?: string;
  };
}

export class AuthService {
  private currentUser: AuthUser | null = null;
  private authStateListeners: Array<(user: AuthUser | null) => void> = [];

  constructor() {
    console.log(
      "[PERF] AuthService constructor starting at:",
      new Date().toISOString()
    );

    // Listen for auth state changes
    onAuthStateChanged(auth, (user) => {
      console.log(
        "[PERF] Firebase auth state changed at:",
        new Date().toISOString()
      );
      console.log("[PERF] Firebase user:", user ? 'present' : 'null');
      this.currentUser = user ? this.mapFirebaseUser(user) : null;
      console.log("[PERF] Mapped currentUser:", this.currentUser ? 'present' : 'null');
      this.notifyListeners();
      console.log("[PERF] Notified", this.authStateListeners.length, "listeners");
    });

    console.log(
      "[PERF] AuthService constructor completed at:",
      new Date().toISOString()
    );
  }

  /**
   * Sign in with Google
   */
  async signInWithGoogle(): Promise<AuthUser> {
    try {
      const result: UserCredential = await signInWithPopup(
        auth,
        googleProvider
      );
      const user = this.mapFirebaseUser(result.user);

      log.success(
        "Google sign-in successful",
        { email: user.email },
        "AuthService"
      );

      // Check if auto-add to waitlist is enabled
      await this.handleAutoWaitlist(user);

      return user;
    } catch (error) {
      log.failure("Google sign-in failed", error, "AuthService");
      throw new Error("Failed to sign in with Google");
    }
  }

  /**
   * Sign out the current user
   */
  async signOutUser(): Promise<void> {
    try {
      await signOut(auth);
      log.success("Sign-out successful", undefined, "AuthService");
    } catch (error) {
      log.failure("Sign-out failed", error, "AuthService");
      throw new Error("Failed to sign out");
    }
  }

  /**
   * Get the current user
   */
  getCurrentUser(): AuthUser | null {
    return this.currentUser;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.currentUser !== null;
  }

  /**
   * Check if user is admin (based on email domain or specific emails)
   */
  isAdmin(): boolean {
    if (!this.currentUser?.email) return false;

    // Add your admin email domains or specific emails here
    const adminEmails = [
      "admin@printer.ai",
      "zach@printer.ai",
      "silverzweig@gmail.com",
      // Add more admin emails as needed
    ];

    const adminDomains = [
      "@printer.ai",
      // Add more admin domains as needed
    ];

    const email = this.currentUser.email.toLowerCase();

    // Check specific admin emails
    if (adminEmails.includes(email)) return true;

    // Check admin domains
    return adminDomains.some((domain) => email.endsWith(domain));
  }

  /**
   * Get user's display name or fallback to email
   */
  getDisplayName(): string {
    if (!this.currentUser) return "Guest";
    return this.currentUser.displayName || this.currentUser.email || "User";
  }

  /**
   * Get user's profile photo URL
   */
  getPhotoURL(): string | null {
    return this.currentUser?.photoURL || null;
  }

  /**
   * Listen for authentication state changes
   */
  onAuthStateChange(callback: (user: AuthUser | null) => void): () => void {
    this.authStateListeners.push(callback);

    // Return unsubscribe function
    return () => {
      const index = this.authStateListeners.indexOf(callback);
      if (index > -1) {
        this.authStateListeners.splice(index, 1);
      }
    };
  }

  /**
   * Wait for authentication to be determined
   */
  async waitForAuth(): Promise<AuthUser | null> {
    return new Promise((resolve) => {
      if (this.currentUser !== undefined) {
        resolve(this.currentUser);
        return;
      }

      const unsubscribe = this.onAuthStateChange((user) => {
        unsubscribe();
        resolve(user);
      });
    });
  }

  /**
   * Get user's ID token for API requests
   */
  async getIdToken(): Promise<string | null> {
    if (!this.currentUser) return null;

    try {
      const user = auth.currentUser;
      if (!user) return null;

      return await user.getIdToken();
    } catch (error) {
      log.error("Failed to get ID token", error, "AuthService");
      return null;
    }
  }

  /**
   * Refresh the user's ID token
   */
  async refreshIdToken(): Promise<string | null> {
    if (!this.currentUser) return null;

    try {
      const user = auth.currentUser;
      if (!user) return null;

      return await user.getIdToken(true); // Force refresh
    } catch (error) {
      log.error("Failed to refresh ID token", error, "AuthService");
      return null;
    }
  }

  /**
   * Handle auto-add to waitlist if enabled
   */
  private async handleAutoWaitlist(user: AuthUser): Promise<void> {
    try {
      // Dynamic import to avoid circular dependency
      const { userService } = await import("@/lib/services/user-service");

      // Create or update user profile - this will handle waitlist logic
      await userService.createUserProfile(user, {
        signupSource: "google",
        lastActiveAt: new Date(),
        sessionCount: 1,
      });

      log.success(
        "User profile created/updated",
        { email: user.email },
        "AuthService"
      );
    } catch (error) {
      // Don't throw error to avoid breaking sign-in flow
      log.error("Failed to handle user profile creation", error, "AuthService");
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
    };
  }

  private notifyListeners(): void {
    this.authStateListeners.forEach((callback) => {
      try {
        callback(this.currentUser);
      } catch (error) {
        log.error("Error in auth state listener", error, "AuthService");
      }
    });
  }
}

// Global auth service instance
export const authService = new AuthService();

// Helper functions
export const signInWithGoogle = () => authService.signInWithGoogle();
export const signOutUser = () => authService.signOutUser();
export const getCurrentUser = () => authService.getCurrentUser();
export const isAuthenticated = () => authService.isAuthenticated();
export const isAdmin = () => authService.isAdmin();
export const getDisplayName = () => authService.getDisplayName();
export const getPhotoURL = () => authService.getPhotoURL();
export const onAuthStateChange = (callback: (user: AuthUser | null) => void) =>
  authService.onAuthStateChange(callback);
export const waitForAuth = () => authService.waitForAuth();
export const getIdToken = () => authService.getIdToken();
export const refreshIdToken = () => authService.refreshIdToken();

export default authService;
