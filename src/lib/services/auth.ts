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
    // Listen for auth state changes
    onAuthStateChanged(auth, (user) => {
      this.currentUser = user ? this.mapFirebaseUser(user) : null;
      this.notifyListeners();
    });
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
      // Clear server-side cookies first
      await this.clearServerCookies();

      // Then sign out from Firebase
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
   * Handle auto-add to waitlist if enabled and set server-side cookies
   */
  private async handleAutoWaitlist(user: AuthUser): Promise<void> {
    try {
      // Dynamic import to avoid circular dependency
      const { userService } = await import("@/lib/services/user-service");

      // Create or update user profile - this will handle waitlist logic
      const userProfile = await userService.createUserProfile(user, {
        signupSource: "google",
        lastActiveAt: new Date(),
        sessionCount: 1,
      });

      // Get ID token for server-side authentication
      const idToken = await this.getIdToken();
      if (idToken) {
        // Set server-side cookies for middleware and server components
        await this.setServerCookies(userProfile, idToken);
      }

      log.success(
        "User profile created/updated",
        { email: user.email, status: userProfile.status },
        "AuthService"
      );
    } catch (error) {
      // Don't throw error to avoid breaking sign-in flow
      log.error("Failed to handle user profile creation", error, "AuthService");
    }
  }

  /**
   * Set server-side cookies for authentication
   */
  private async setServerCookies(
    userProfile: any,
    idToken: string
  ): Promise<void> {
    try {
      // Call API route to set server-side cookies
      const response = await fetch("/api/auth/set-cookies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          user: userProfile,
          token: idToken,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to set server cookies");
      }

      log.success(
        "Server cookies set",
        { uid: userProfile.uid },
        "AuthService"
      );
    } catch (error) {
      log.error("Failed to set server cookies", error, "AuthService");
    }
  }

  /**
   * Clear server-side cookies on sign out
   */
  private async clearServerCookies(): Promise<void> {
    try {
      const response = await fetch("/api/auth/clear-cookies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to clear server cookies");
      }

      log.success("Server cookies cleared", undefined, "AuthService");
    } catch (error) {
      log.error("Failed to clear server cookies", error, "AuthService");
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
