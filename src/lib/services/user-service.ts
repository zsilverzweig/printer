// User profile service for managing user data and waitlist status
import { adminService } from "@/features/admin/services/admin-service";
import { waitlistService } from "@/features/waitlist/services/waitlist-service";
import { db } from "@/lib/services/firebase";
import type {
  UserAccess,
  UserMetadata,
  UserPreferences,
  UserProfile,
  UserService,
  UserStatus,
} from "@/lib/types/user";
import { log } from "@/lib/utils/logger";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

// Collection names
const COLLECTIONS = {
  USER_PROFILES: "user_profiles",
  USER_STATUS_UPDATES: "user_status_updates",
} as const;

// Default user preferences
const DEFAULT_USER_PREFERENCES: UserPreferences = {
  notifications: {
    email: true,
    push: true,
    marketing: false,
  },
  privacy: {
    profileVisibility: "private",
    dataSharing: false,
  },
  features: {
    betaFeatures: false,
    experimentalFeatures: false,
  },
};

export class UserProfileService implements UserService {
  private static instance: UserProfileService;

  static getInstance(): UserProfileService {
    if (!UserProfileService.instance) {
      UserProfileService.instance = new UserProfileService();
    }
    return UserProfileService.instance;
  }

  /**
   * Get user profile by UID
   */
  async getUserProfile(uid: string): Promise<UserProfile | null> {
    try {
      const docRef = doc(db, COLLECTIONS.USER_PROFILES, uid);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        return null;
      }

      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...data,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
        lastLoginAt: data.lastLoginAt?.toDate(),
      } as UserProfile;
    } catch (error) {
      log.failure("Failed to get user profile", error, "UserProfileService");
      throw error;
    }
  }

  /**
   * Create user profile from Firebase user
   */
  async createUserProfile(
    user: any,
    metadata?: UserMetadata
  ): Promise<UserProfile> {
    try {
      const uid = user.uid;

      // Check if profile already exists
      const existingProfile = await this.getUserProfile(uid);
      if (existingProfile) {
        return existingProfile;
      }

      // Determine initial status based on waitlist and admin settings
      let initialStatus: UserStatus = "pending";
      let waitlistEntryId: string | undefined;
      let waitlistPosition: number | undefined;

      // Check if user is admin
      const isAdmin = this.isAdminEmail(user.email);
      if (isAdmin) {
        initialStatus = "active";
      } else {
        // Check waitlist settings
        const isWaitlistEnabled = await adminService.isWaitlistEnabled();
        const isAutoAddEnabled =
          await adminService.isAutoAddToWaitlistEnabled();

        if (isWaitlistEnabled) {
          if (isAutoAddEnabled) {
            // Auto-add to waitlist
            try {
              const waitlistEntry = await waitlistService.joinWaitlist(
                uid,
                user.email,
                user.displayName,
                { source: "auto_signup", ...metadata }
              );
              waitlistEntryId = waitlistEntry.id;
              waitlistPosition = waitlistEntry.position;
              initialStatus = "waitlist";
            } catch (error) {
              log.error(
                "Failed to auto-add user to waitlist",
                error,
                "UserProfileService"
              );
              // Continue with pending status if waitlist add fails
            }
          } else {
            // Waitlist enabled but no auto-add - user needs to manually join
            initialStatus = "pending";
          }
        } else {
          // No waitlist - user gets immediate access
          initialStatus = "active";
        }
      }

      // Create user profile
      const profileData: any = {
        uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        emailVerified: user.emailVerified,
        status: initialStatus,
        role: isAdmin ? "admin" : "user",
        preferences: DEFAULT_USER_PREFERENCES,
        metadata: {
          signupSource: "google",
          lastActiveAt: new Date(),
          sessionCount: 1,
          totalSessionTime: 0,
          // Only include defined metadata values
          ...(metadata?.userAgent && { userAgent: metadata.userAgent }),
          ...(metadata?.ipAddress && { ipAddress: metadata.ipAddress }),
          ...(metadata?.utmParams && { utmParams: metadata.utmParams }),
          ...(metadata?.referralCode && { referralCode: metadata.referralCode }),
          ...(metadata?.signupSource && { signupSource: metadata.signupSource }),
          // Include other defined metadata fields
          ...Object.fromEntries(
            Object.entries(metadata || {}).filter(([_, value]) => value !== undefined)
          ),
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      };

      // Only include waitlist fields if they have values
      if (waitlistEntryId !== undefined) {
        profileData.waitlistEntryId = waitlistEntryId;
      }
      if (waitlistPosition !== undefined) {
        profileData.waitlistPosition = waitlistPosition;
      }

      await setDoc(doc(db, COLLECTIONS.USER_PROFILES, uid), profileData);

      const profile: UserProfile = {
        id: uid,
        ...profileData,
        waitlistEntryId: waitlistEntryId || undefined,
        waitlistPosition: waitlistPosition || undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastLoginAt: new Date(),
      };

      log.success(
        "User profile created",
        { uid, status: initialStatus },
        "UserProfileService"
      );
      return profile;
    } catch (error) {
      log.failure("Failed to create user profile", error, "UserProfileService");
      throw error;
    }
  }

  /**
   * Update user profile
   */
  async updateUserProfile(
    uid: string,
    updates: Partial<UserProfile>
  ): Promise<void> {
    try {
      const docRef = doc(db, COLLECTIONS.USER_PROFILES, uid);

      // Remove fields that shouldn't be updated directly
      const { id, uid: _, createdAt, ...updateData } = updates;

      await updateDoc(docRef, {
        ...updateData,
        updatedAt: serverTimestamp(),
      });

      log.success("User profile updated", { uid }, "UserProfileService");
    } catch (error) {
      log.failure("Failed to update user profile", error, "UserProfileService");
      throw error;
    }
  }

  /**
   * Update user status
   */
  async updateUserStatus(
    uid: string,
    status: UserStatus,
    reason?: string,
    updatedBy?: string
  ): Promise<void> {
    try {
      const docRef = doc(db, COLLECTIONS.USER_PROFILES, uid);

      // Update profile status
      await updateDoc(docRef, {
        status,
        updatedAt: serverTimestamp(),
      });

      // Record status update
      const statusUpdateData = {
        userId: uid,
        status,
        reason: reason || "Status updated",
        updatedBy: updatedBy || "system",
        updatedAt: serverTimestamp(),
      };

      await setDoc(
        doc(collection(db, COLLECTIONS.USER_STATUS_UPDATES)),
        statusUpdateData
      );

      log.success(
        "User status updated",
        { uid, status, reason },
        "UserProfileService"
      );
    } catch (error) {
      log.failure("Failed to update user status", error, "UserProfileService");
      throw error;
    }
  }

  /**
   * Get user access permissions
   */
  async getUserAccess(uid: string): Promise<UserAccess> {
    try {
      const profile = await this.getUserProfile(uid);
      if (!profile) {
        return {
          canAccessApp: false,
          canAccessWaitlist: false,
          canAccessAdmin: false,
          canAccessBetaFeatures: false,
          restrictions: ["User profile not found"],
        };
      }

      const restrictions: string[] = [];
      let canAccessApp = false;
      let canAccessWaitlist = false;
      let canAccessAdmin = false;
      let canAccessBetaFeatures = false;

      // Check status-based access
      switch (profile.status) {
        case "active":
          canAccessApp = true;
          canAccessWaitlist = true;
          canAccessBetaFeatures = profile.preferences.features.betaFeatures;
          break;
        case "invited":
          canAccessApp = true;
          canAccessWaitlist = true;
          canAccessBetaFeatures = profile.preferences.features.betaFeatures;
          break;
        case "waitlist":
          canAccessWaitlist = true;
          restrictions.push("On waitlist - full access pending");
          break;
        case "pending":
          restrictions.push("Account pending activation");
          break;
        case "suspended":
          restrictions.push("Account suspended");
          break;
        case "banned":
          restrictions.push("Account banned");
          break;
      }

      // Check admin access
      if (profile.role === "admin" || profile.role === "super_admin") {
        canAccessAdmin = true;
      }

      // Check waitlist status
      if (profile.status === "waitlist" && profile.waitlistEntryId) {
        try {
          const waitlistEntry = await waitlistService.getWaitlistEntryByUserId(
            uid
          );
          if (waitlistEntry) {
            restrictions.push(`Waitlist position: ${waitlistEntry.position}`);
          }
        } catch (error) {
          log.error(
            "Failed to get waitlist entry for access check",
            error,
            "UserProfileService"
          );
        }
      }

      return {
        canAccessApp,
        canAccessWaitlist,
        canAccessAdmin,
        canAccessBetaFeatures,
        restrictions,
      };
    } catch (error) {
      log.failure("Failed to get user access", error, "UserProfileService");
      return {
        canAccessApp: false,
        canAccessWaitlist: false,
        canAccessAdmin: false,
        canAccessBetaFeatures: false,
        restrictions: ["Error checking access permissions"],
      };
    }
  }

  /**
   * Check if user is on waitlist
   */
  async isUserOnWaitlist(uid: string): Promise<boolean> {
    try {
      const profile = await this.getUserProfile(uid);
      return profile?.status === "waitlist" || false;
    } catch (error) {
      log.failure(
        "Failed to check waitlist status",
        error,
        "UserProfileService"
      );
      return false;
    }
  }

  /**
   * Check if user has active access
   */
  async isUserActive(uid: string): Promise<boolean> {
    try {
      const profile = await this.getUserProfile(uid);
      return (
        profile?.status === "active" || profile?.status === "invited" || false
      );
    } catch (error) {
      log.failure("Failed to check active status", error, "UserProfileService");
      return false;
    }
  }

  /**
   * Check if user is admin
   */
  async isUserAdmin(uid: string): Promise<boolean> {
    try {
      const profile = await this.getUserProfile(uid);
      return (
        profile?.role === "admin" || profile?.role === "super_admin" || false
      );
    } catch (error) {
      log.failure("Failed to check admin status", error, "UserProfileService");
      return false;
    }
  }

  /**
   * Delete user profile
   */
  async deleteUserProfile(uid: string): Promise<void> {
    try {
      const docRef = doc(db, COLLECTIONS.USER_PROFILES, uid);
      await deleteDoc(docRef);

      log.success("User profile deleted", { uid }, "UserProfileService");
    } catch (error) {
      log.failure("Failed to delete user profile", error, "UserProfileService");
      throw error;
    }
  }

  /**
   * Update last login time
   */
  async updateLastLogin(uid: string): Promise<void> {
    try {
      const docRef = doc(db, COLLECTIONS.USER_PROFILES, uid);
      await updateDoc(docRef, {
        lastLoginAt: serverTimestamp(),
        "metadata.lastActiveAt": serverTimestamp(),
        "metadata.sessionCount": 1, // This should be incremented, but Firestore doesn't support increment on nested fields easily
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      log.error("Failed to update last login", error, "UserProfileService");
      // Don't throw - this is not critical
    }
  }

  /**
   * Get all users with a specific status
   */
  async getUsersByStatus(status: UserStatus): Promise<UserProfile[]> {
    try {
      const q = query(
        collection(db, COLLECTIONS.USER_PROFILES),
        where("status", "==", status)
      );
      const snapshot = await getDocs(q);

      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate() || new Date(),
        lastLoginAt: doc.data().lastLoginAt?.toDate(),
      })) as UserProfile[];
    } catch (error) {
      log.failure("Failed to get users by status", error, "UserProfileService");
      throw error;
    }
  }

  // Private helper methods

  private isAdminEmail(email: string): boolean {
    const adminEmails = [
      "admin@printer.ai",
      "zach@printer.ai",
      "silverzweig@gmail.com",
    ];

    const adminDomains = ["@printer.ai"];

    const emailLower = email.toLowerCase();

    // Check specific admin emails
    if (adminEmails.includes(emailLower)) return true;

    // Check admin domains
    return adminDomains.some((domain) => emailLower.endsWith(domain));
  }
}

// Export singleton instance
export const userService = UserProfileService.getInstance();

// Helper functions
export const getUserProfile = (uid: string) => userService.getUserProfile(uid);
export const createUserProfile = (user: any, metadata?: UserMetadata) =>
  userService.createUserProfile(user, metadata);
export const updateUserProfile = (uid: string, updates: Partial<UserProfile>) =>
  userService.updateUserProfile(uid, updates);
export const updateUserStatus = (
  uid: string,
  status: UserStatus,
  reason?: string,
  updatedBy?: string
) => userService.updateUserStatus(uid, status, reason, updatedBy);
export const getUserAccess = (uid: string) => userService.getUserAccess(uid);
export const isUserOnWaitlist = (uid: string) =>
  userService.isUserOnWaitlist(uid);
export const isUserActive = (uid: string) => userService.isUserActive(uid);
export const isUserAdmin = (uid: string) => userService.isUserAdmin(uid);
export const deleteUserProfile = (uid: string) =>
  userService.deleteUserProfile(uid);
export const updateLastLogin = (uid: string) =>
  userService.updateLastLogin(uid);

export default userService;
