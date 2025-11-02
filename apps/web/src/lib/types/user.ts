// User profile and status types for Printer

export interface UserProfile {
  id: string;
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  emailVerified: boolean;
  status: UserStatus;
  role: UserRole;
  preferences: UserPreferences;
  metadata: UserMetadata;
  alpacaConnection?: AlpacaConnection;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
}

export type UserStatus =
  | "pending" // User signed up but not yet processed
  | "invited" // User was invited
  | "active" // User has full access
  | "suspended" // User is temporarily suspended
  | "banned"; // User is permanently banned

export type UserRole =
  | "user" // Regular user
  | "admin" // Admin user
  | "super_admin"; // Super admin

export interface UserPreferences {
  notifications: {
    email: boolean;
    push: boolean;
    marketing: boolean;
  };
  privacy: {
    profileVisibility: "public" | "private";
    dataSharing: boolean;
  };
  features: {
    betaFeatures: boolean;
    experimentalFeatures: boolean;
  };
}

export interface UserMetadata {
  signupSource?: string;
  referralCode?: string;
  userAgent?: string;
  ipAddress?: string;
  utmParams?: Record<string, string>;
  lastActiveAt?: Date;
  sessionCount?: number;
  totalSessionTime?: number;
}

export interface AlpacaConnection {
  alpacaUserId: string;
  accessToken: string;
  tokenType: string;
  scope: string;
  connectedAt: Date;
  status: "active" | "expired" | "revoked";
  environment: "paper" | "live" | "both";
}

export interface UserStatusUpdate {
  status: UserStatus;
  reason?: string;
  updatedBy: string;
  updatedAt: Date;
}

export interface UserAccess {
  canAccessApp: boolean;
  canAccessAdmin: boolean;
  canAccessBetaFeatures: boolean;
  restrictions: string[];
}

// Service interfaces
export interface UserService {
  getUserProfile(uid: string): Promise<UserProfile | null>;
  createUserProfile(user: any, metadata?: UserMetadata): Promise<UserProfile>;
  updateUserProfile(uid: string, updates: Partial<UserProfile>): Promise<void>;
  updateUserStatus(
    uid: string,
    status: UserStatus,
    reason?: string,
    updatedBy?: string
  ): Promise<void>;
  getUserAccess(uid: string): Promise<UserAccess>;
  isUserActive(uid: string): Promise<boolean>;
  isUserAdmin(uid: string): Promise<boolean>;
  deleteUserProfile(uid: string): Promise<void>;
}

// Hook return types
export interface UseUserProfileReturn {
  profile: UserProfile | null;
  access: UserAccess | null;
  loading: boolean;
  error: string | null;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  updateStatus: (status: UserStatus, reason?: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

export interface UseUserAccessReturn {
  access: UserAccess | null;
  loading: boolean;
  error: string | null;
  canAccess: (feature: keyof UserAccess) => boolean;
  hasRestriction: (restriction: string) => boolean;
  refreshAccess: () => Promise<void>;
}
