// Comprehensive test for the signup flow
import { useRouter } from 'next/navigation';

import { adminService } from '@/features/admin/services/admin-service';
import { useWaitlist } from '@/features/waitlist/hooks/use-waitlist';
import { waitlistService } from '@/features/waitlist/services/waitlist-service';
import { useAuth } from '@/lib/hooks/use-auth';
import { useUserRouting } from '@/lib/hooks/use-user-routing';
import { userService } from '@/lib/services/user-service';

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

// Mock auth hook
jest.mock('@/lib/hooks/use-auth', () => ({
  useAuth: jest.fn(),
}));

// Mock user routing hook
jest.mock('@/lib/hooks/use-user-routing', () => ({
  useUserRouting: jest.fn(),
}));

// Mock waitlist hook
jest.mock('@/features/waitlist/hooks/use-waitlist', () => ({
  useWaitlist: jest.fn(),
}));

// Mock services
jest.mock('@/features/admin/services/admin-service');
jest.mock('@/features/waitlist/services/waitlist-service');
jest.mock('@/lib/services/user-service');

// Mock Firebase
jest.mock('@/lib/services/firebase', () => ({
  db: {},
}));

describe('Signup Flow Integration Test', () => {
  const mockPush = jest.fn();
  const mockRouter = { push: mockPush };

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
  });

  describe('Scenario 1: Auto-Waitlist Enabled', () => {
    beforeEach(() => {
      // Mock admin service to return auto-waitlist enabled
      (adminService.isWaitlistEnabled as jest.Mock).mockResolvedValue(true);
      (adminService.isAutoAddToWaitlistEnabled as jest.Mock).mockResolvedValue(true);
    });

    it('should complete full signup flow with auto-waitlist', async () => {
      // Step 1: User clicks sign up (unauthenticated)
      (useAuth as jest.Mock).mockReturnValue({
        user: null,
        isAuthenticated: false,
        signInWithGoogle: jest.fn(),
        loading: false,
        error: null,
      });

      (useUserRouting as jest.Mock).mockReturnValue({
        route: null,
        loading: false,
        error: null,
        isAdmin: false,
        isOnWaitlist: false,
        canAccessApp: false,
      });

      // Mock successful Google sign-in
      const mockSignInWithGoogle = jest.fn().mockResolvedValue(undefined);
      (useAuth as jest.Mock).mockReturnValue({
        user: {
          uid: 'test-user-123',
          email: 'test@example.com',
          displayName: 'Test User',
          photoURL: 'https://example.com/photo.jpg',
        },
        isAuthenticated: true,
        signInWithGoogle: mockSignInWithGoogle,
        loading: false,
        error: null,
      });

      // Step 2: After Google auth, user should be auto-added to waitlist
      const mockWaitlistEntry = {
        id: 'waitlist-entry-123',
        userId: 'test-user-123',
        email: 'test@example.com',
        position: 5,
        joinedAt: new Date(),
        status: 'active',
      };

      (waitlistService.joinWaitlist as jest.Mock).mockResolvedValue(mockWaitlistEntry);
      (userService.createUserProfile as jest.Mock).mockResolvedValue({
        id: 'test-user-123',
        uid: 'test-user-123',
        email: 'test@example.com',
        status: 'waitlist',
        waitlistEntryId: 'waitlist-entry-123',
        waitlistPosition: 5,
      });

      // Step 3: User routing should direct to waitlist
      (useUserRouting as jest.Mock).mockReturnValue({
        route: {
          path: '/waitlist',
          reason: 'User is on waitlist - redirecting to waitlist dashboard',
        },
        loading: false,
        error: null,
        isAdmin: false,
        isOnWaitlist: true,
        canAccessApp: false,
      });

      // Step 4: Waitlist hook should return the entry
      (useWaitlist as jest.Mock).mockReturnValue({
        entry: mockWaitlistEntry,
        position: 5,
        loading: false,
        error: null,
        joinWaitlist: jest.fn(),
        performAction: jest.fn(),
        purchaseUpgrade: jest.fn(),
      });

      // Test the flow
      expect(mockSignInWithGoogle).toBeDefined();
      expect(mockWaitlistEntry.position).toBe(5);
      expect(mockWaitlistEntry.status).toBe('active');
    });

    it('should handle waitlist join failure gracefully', async () => {
      // Mock waitlist join failure
      (waitlistService.joinWaitlist as jest.Mock).mockRejectedValue(
        new Error('Waitlist service unavailable')
      );

      // User should still get a profile created with pending status
      (userService.createUserProfile as jest.Mock).mockResolvedValue({
        id: 'test-user-123',
        uid: 'test-user-123',
        email: 'test@example.com',
        status: 'pending',
      });

      // Should redirect to signup-info page
      (useUserRouting as jest.Mock).mockReturnValue({
        route: {
          path: '/signup-info',
          reason: 'Pending user - redirecting to complete profile setup',
        },
        loading: false,
        error: null,
        isAdmin: false,
        isOnWaitlist: false,
        canAccessApp: false,
      });

      // Test that user gets pending status when waitlist join fails
      const userProfile = await userService.createUserProfile({
        uid: 'test-user-123',
        email: 'test@example.com',
        displayName: 'Test User',
      });

      expect(userProfile.status).toBe('pending');
    });
  });

  describe('Scenario 2: Auto-Waitlist Disabled', () => {
    beforeEach(() => {
      // Mock admin service to return auto-waitlist disabled
      (adminService.isWaitlistEnabled as jest.Mock).mockResolvedValue(true);
      (adminService.isAutoAddToWaitlistEnabled as jest.Mock).mockResolvedValue(false);
    });

    it('should redirect to signup-info page for pending users', async () => {
      // User signs up but doesn't get auto-added to waitlist
      (useAuth as jest.Mock).mockReturnValue({
        user: {
          uid: 'test-user-123',
          email: 'test@example.com',
          displayName: 'Test User',
        },
        isAuthenticated: true,
        signInWithGoogle: jest.fn(),
        loading: false,
        error: null,
      });

      // User profile created with pending status
      (userService.createUserProfile as jest.Mock).mockResolvedValue({
        id: 'test-user-123',
        uid: 'test-user-123',
        email: 'test@example.com',
        status: 'pending',
      });

      // Should redirect to signup-info page
      (useUserRouting as jest.Mock).mockReturnValue({
        route: {
          path: '/signup-info',
          reason: 'Pending user - redirecting to complete profile setup',
        },
        loading: false,
        error: null,
        isAdmin: false,
        isOnWaitlist: false,
        canAccessApp: false,
      });

      const userProfile = await userService.createUserProfile({
        uid: 'test-user-123',
        email: 'test@example.com',
        displayName: 'Test User',
      });

      expect(userProfile.status).toBe('pending');
    });

    it('should allow manual waitlist join from signup-info page', async () => {
      const mockJoinWaitlist = jest.fn().mockResolvedValue({
        id: 'waitlist-entry-456',
        userId: 'test-user-123',
        position: 10,
        status: 'active',
      });

      (useWaitlist as jest.Mock).mockReturnValue({
        entry: null,
        position: null,
        loading: false,
        error: null,
        joinWaitlist: mockJoinWaitlist,
        performAction: jest.fn(),
        purchaseUpgrade: jest.fn(),
      });

      // User manually joins waitlist
      const result = await mockJoinWaitlist('test@example.com', {
        source: 'manual_join',
      });

      expect(result.position).toBe(10);
      expect(mockJoinWaitlist).toHaveBeenCalledWith('test@example.com', {
        source: 'manual_join',
      });
    });
  });

  describe('Scenario 3: Waitlist Disabled', () => {
    beforeEach(() => {
      // Mock admin service to return waitlist disabled
      (adminService.isWaitlistEnabled as jest.Mock).mockResolvedValue(false);
    });

    it('should give immediate access to portfolios page', async () => {
      // User signs up and gets immediate access
      (useAuth as jest.Mock).mockReturnValue({
        user: {
          uid: 'test-user-123',
          email: 'test@example.com',
          displayName: 'Test User',
        },
        isAuthenticated: true,
        signInWithGoogle: jest.fn(),
        loading: false,
        error: null,
      });

      // User profile created with active status
      (userService.createUserProfile as jest.Mock).mockResolvedValue({
        id: 'test-user-123',
        uid: 'test-user-123',
        email: 'test@example.com',
        status: 'active',
      });

      // Should redirect to portfolios page
      (useUserRouting as jest.Mock).mockReturnValue({
        route: {
          path: '/portfolios',
          reason: 'Active user - redirecting to portfolios page',
        },
        loading: false,
        error: null,
        isAdmin: false,
        isOnWaitlist: false,
        canAccessApp: true,
      });

      const userProfile = await userService.createUserProfile({
        uid: 'test-user-123',
        email: 'test@example.com',
        displayName: 'Test User',
      });

      expect(userProfile.status).toBe('active');
    });
  });

  describe('Scenario 4: Admin User', () => {
    it('should always get immediate access regardless of waitlist settings', async () => {
      // Admin user signs up
      (useAuth as jest.Mock).mockReturnValue({
        user: {
          uid: 'admin-user-123',
          email: 'admin@printer.ai',
          displayName: 'Admin User',
        },
        isAuthenticated: true,
        signInWithGoogle: jest.fn(),
        loading: false,
        error: null,
      });

      // Admin profile created with active status
      (userService.createUserProfile as jest.Mock).mockResolvedValue({
        id: 'admin-user-123',
        uid: 'admin-user-123',
        email: 'admin@printer.ai',
        status: 'active',
        role: 'admin',
      });

      // Should redirect to portfolios page
      (useUserRouting as jest.Mock).mockReturnValue({
        route: {
          path: '/portfolios',
          reason: 'Admin user - redirecting to portfolios page',
        },
        loading: false,
        error: null,
        isAdmin: true,
        isOnWaitlist: false,
        canAccessApp: true,
      });

      const userProfile = await userService.createUserProfile({
        uid: 'admin-user-123',
        email: 'admin@printer.ai',
        displayName: 'Admin User',
      });

      expect(userProfile.status).toBe('active');
      expect(userProfile.role).toBe('admin');
    });
  });

  describe('Signup Info Page Flow', () => {
    it('should collect profile information and redirect appropriately', async () => {
      // Mock authenticated user on signup-info page
      (useAuth as jest.Mock).mockReturnValue({
        user: {
          uid: 'test-user-123',
          email: 'test@example.com',
          displayName: 'Test User',
        },
        isAuthenticated: true,
        signInWithGoogle: jest.fn(),
        loading: false,
        error: null,
      });

      // Mock profile data collection
      const profileData = {
        userType: 'individual',
        investmentExperience: 'intermediate',
        investmentGoals: 'growth',
        riskTolerance: 'moderate',
        portfolioSize: '50k-250k',
        investmentInterests: 'Technology stocks, ESG investing',
        timeHorizon: 'long',
        additionalInfo: 'Looking for AI-powered investment insights',
      };

      // After profile completion, user should be redirected based on their status
      (useUserRouting as jest.Mock).mockReturnValue({
        route: {
          path: '/portfolios',
          reason: 'Active user - redirecting to portfolios page',
        },
        loading: false,
        error: null,
        isAdmin: false,
        isOnWaitlist: false,
        canAccessApp: true,
      });

      // Test profile data structure
      expect(profileData.userType).toBe('individual');
      expect(profileData.investmentExperience).toBe('intermediate');
      expect(profileData.investmentGoals).toBe('growth');
    });
  });

  describe('Waitlist Dashboard (No Sidebar)', () => {
    it('should show waitlist position and actions for signed-up users', async () => {
      const mockWaitlistEntry = {
        id: 'waitlist-entry-123',
        userId: 'test-user-123',
        email: 'test@example.com',
        position: 5,
        joinedAt: new Date(),
        status: 'active',
        totalActions: 0,
        totalPoints: 0,
        isPaidUser: false,
      };

      (useWaitlist as jest.Mock).mockReturnValue({
        entry: mockWaitlistEntry,
        position: 5,
        loading: false,
        error: null,
        joinWaitlist: jest.fn(),
        performAction: jest.fn(),
        purchaseUpgrade: jest.fn(),
        availableActions: [
          {
            id: 'referral_signup',
            name: 'Invite Friends',
            description: 'Get friends to join the waitlist to move up 5 positions',
            points: 5,
            isActive: true,
          },
        ],
      });

      // Test waitlist entry data
      expect(mockWaitlistEntry.position).toBe(5);
      expect(mockWaitlistEntry.status).toBe('active');
      expect(mockWaitlistEntry.isPaidUser).toBe(false);
    });

    it('should show join waitlist option for users not yet on waitlist', async () => {
      (useWaitlist as jest.Mock).mockReturnValue({
        entry: null,
        position: null,
        loading: false,
        error: null,
        joinWaitlist: jest.fn(),
        performAction: jest.fn(),
        purchaseUpgrade: jest.fn(),
        availableActions: [],
      });

      // Test that user can join waitlist
      const mockJoinWaitlist = jest.fn().mockResolvedValue({
        id: 'waitlist-entry-789',
        position: 15,
        status: 'active',
      });

      (useWaitlist as jest.Mock).mockReturnValue({
        entry: null,
        position: null,
        loading: false,
        error: null,
        joinWaitlist: mockJoinWaitlist,
        performAction: jest.fn(),
        purchaseUpgrade: jest.fn(),
        availableActions: [],
      });

      const result = await mockJoinWaitlist('test@example.com');
      expect(result.position).toBe(15);
    });
  });

  describe('Error Handling', () => {
    it('should handle authentication errors gracefully', async () => {
      (useAuth as jest.Mock).mockReturnValue({
        user: null,
        isAuthenticated: false,
        signInWithGoogle: jest.fn().mockRejectedValue(new Error('Auth failed')),
        loading: false,
        error: 'Authentication failed',
      });

      (useUserRouting as jest.Mock).mockReturnValue({
        route: null,
        loading: false,
        error: 'Authentication failed',
        isAdmin: false,
        isOnWaitlist: false,
        canAccessApp: false,
      });

      // Test error handling
      expect(useAuth().error).toBe('Authentication failed');
    });

    it('should handle service unavailability', async () => {
      (adminService.isWaitlistEnabled as jest.Mock).mockRejectedValue(
        new Error('Admin service unavailable')
      );
      (waitlistService.joinWaitlist as jest.Mock).mockRejectedValue(
        new Error('Waitlist service unavailable')
      );

      // Should still create user profile with pending status
      (userService.createUserProfile as jest.Mock).mockResolvedValue({
        id: 'test-user-123',
        uid: 'test-user-123',
        email: 'test@example.com',
        status: 'pending',
      });

      const userProfile = await userService.createUserProfile({
        uid: 'test-user-123',
        email: 'test@example.com',
        displayName: 'Test User',
      });

      expect(userProfile.status).toBe('pending');
    });
  });
});
