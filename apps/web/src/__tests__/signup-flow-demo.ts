// Demo script to show the signup flow logic
// This demonstrates the different scenarios without requiring a full test environment

interface MockUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
}

interface MockAdminConfig {
  waitlistEnabled: boolean;
  autoAddToWaitlist: boolean;
}

interface MockUserProfile {
  id: string;
  uid: string;
  email: string;
  status: 'pending' | 'active' | 'waitlist' | 'invited' | 'suspended' | 'banned';
  role: 'user' | 'admin' | 'super_admin';
  waitlistEntryId?: string;
  waitlistPosition?: number;
}

interface MockWaitlistEntry {
  id: string;
  userId: string;
  email: string;
  position: number;
  status: 'active' | 'invited' | 'converted' | 'cancelled';
  joinedAt: Date;
}

// Mock admin service
const mockAdminService = {
  isWaitlistEnabled: async (): Promise<boolean> => {
    // Simulate different admin configurations
    return true; // Change this to test different scenarios
  },
  isAutoAddToWaitlistEnabled: async (): Promise<boolean> => {
    // Simulate different admin configurations
    return false; // Change this to test different scenarios
  }
};

// Mock waitlist service
const mockWaitlistService = {
  joinWaitlist: async (
    userId: string,
    email: string,
    displayName?: string,
    metadata?: Record<string, unknown>
  ): Promise<MockWaitlistEntry> => {
    // Simulate waitlist join
    return {
      id: `waitlist-entry-${Date.now()}`,
      userId,
      email,
      position: Math.floor(Math.random() * 100) + 1,
      status: 'active',
      joinedAt: new Date(),
    };
  }
};

// Mock user service logic
const mockUserService = {
  isAdminEmail: (email: string): boolean => {
    const adminEmails = [
      'admin@printer.ai',
      'zach@printer.ai',
      'silverzweig@gmail.com',
    ];
    const adminDomains = ['@printer.ai'];
    const emailLower = email.toLowerCase();

    return (
      adminEmails.includes(emailLower) ||
      adminDomains.some((domain) => emailLower.endsWith(domain))
    );
  },

  createUserProfile: async (
    user: MockUser,
    metadata?: Record<string, unknown>
  ): Promise<MockUserProfile> => {
    const uid = user.uid;
    let initialStatus: MockUserProfile['status'] = 'pending';
    let waitlistEntryId: string | undefined;
    let waitlistPosition: number | undefined;

    // Check if user is admin
    const isAdmin = mockUserService.isAdminEmail(user.email);
    if (isAdmin) {
      initialStatus = 'active';
    } else {
      // Check waitlist settings
      const isWaitlistEnabled = await mockAdminService.isWaitlistEnabled();
      const isAutoAddEnabled = await mockAdminService.isAutoAddToWaitlistEnabled();

      if (isWaitlistEnabled) {
        if (isAutoAddEnabled) {
          // Auto-add to waitlist
          try {
            const waitlistEntry = await mockWaitlistService.joinWaitlist(
              uid,
              user.email,
              user.displayName,
              { source: 'auto_signup', ...metadata }
            );
            waitlistEntryId = waitlistEntry.id;
            waitlistPosition = waitlistEntry.position;
            initialStatus = 'waitlist';
          } catch (error) {
            console.error('Failed to auto-add user to waitlist:', error);
            // Continue with pending status if waitlist add fails
          }
        } else {
          // Waitlist enabled but no auto-add - user needs to manually join
          initialStatus = 'pending';
        }
      } else {
        // No waitlist - user gets immediate access
        initialStatus = 'active';
      }
    }

    return {
      id: uid,
      uid,
      email: user.email,
      status: initialStatus,
      role: isAdmin ? 'admin' : 'user',
      waitlistEntryId,
      waitlistPosition,
    };
  }
};

// Mock routing logic
const mockUserRouting = {
  determineRoute: (
    isAuthenticated: boolean,
    isAdmin: boolean,
    isOnWaitlist: boolean,
    canAccessApp: boolean
  ) => {
    if (!isAuthenticated) return null;

    if (isAdmin) {
      return {
        path: '/portfolios',
        reason: 'Admin user - redirecting to portfolios page',
      };
    }

    if (isOnWaitlist) {
      return {
        path: '/waitlist',
        reason: 'User is on waitlist - redirecting to waitlist dashboard',
      };
    }

    if (canAccessApp) {
      return {
        path: '/portfolios',
        reason: 'Active user - redirecting to portfolios page',
      };
    }

    // For pending users, redirect to signup info page
    return {
      path: '/signup-info',
      reason: 'Pending user - redirecting to complete profile setup',
    };
  }
};

// Demo function to test different scenarios
export async function demonstrateSignupFlow() {
  console.log('🚀 Signup Flow Demonstration\n');

  // Test users
  const testUsers: MockUser[] = [
    {
      uid: 'admin-user-123',
      email: 'admin@printer.ai',
      displayName: 'Admin User',
    },
    {
      uid: 'regular-user-123',
      email: 'user@example.com',
      displayName: 'Regular User',
    },
    {
      uid: 'printer-user-123',
      email: 'test@printer.ai',
      displayName: 'Printer User',
    },
  ];

  // Test scenarios
  const scenarios = [
    {
      name: 'Scenario 1: Auto-Waitlist Enabled',
      waitlistEnabled: true,
      autoAddEnabled: true,
    },
    {
      name: 'Scenario 2: Auto-Waitlist Disabled',
      waitlistEnabled: true,
      autoAddEnabled: false,
    },
    {
      name: 'Scenario 3: Waitlist Disabled',
      waitlistEnabled: false,
      autoAddEnabled: false,
    },
  ];

  for (const scenario of scenarios) {
    console.log(`\n📋 ${scenario.name}`);
    console.log(`   Waitlist Enabled: ${scenario.waitlistEnabled}`);
    console.log(`   Auto-Add Enabled: ${scenario.autoAddEnabled}`);
    console.log('─'.repeat(50));

    // Override mock admin service for this scenario
    const originalIsWaitlistEnabled = mockAdminService.isWaitlistEnabled;
    const originalIsAutoAddEnabled = mockAdminService.isAutoAddToWaitlistEnabled;
    
    mockAdminService.isWaitlistEnabled = async () => scenario.waitlistEnabled;
    mockAdminService.isAutoAddToWaitlistEnabled = async () => scenario.autoAddEnabled;

    for (const user of testUsers) {
      console.log(`\n👤 Testing user: ${user.displayName} (${user.email})`);
      
      try {
        // Create user profile
        const profile = await mockUserService.createUserProfile(user);
        
        // Determine routing
        const isAdmin = mockUserService.isAdminEmail(user.email);
        const isOnWaitlist = profile.status === 'waitlist';
        const canAccessApp = profile.status === 'active';
        
        const route = mockUserRouting.determineRoute(
          true, // isAuthenticated
          isAdmin,
          isOnWaitlist,
          canAccessApp
        );

        console.log(`   Status: ${profile.status}`);
        console.log(`   Role: ${profile.role}`);
        if (profile.waitlistPosition) {
          console.log(`   Waitlist Position: #${profile.waitlistPosition}`);
        }
        console.log(`   Route: ${route?.path || 'No redirect'}`);
        console.log(`   Reason: ${route?.reason || 'N/A'}`);

        // Show expected user experience
        if (route?.path === '/signup-info') {
          console.log(`   📝 User Experience: Complete profile setup → then redirect based on admin settings`);
        } else if (route?.path === '/waitlist') {
          console.log(`   📊 User Experience: See waitlist dashboard with position #${profile.waitlistPosition}`);
        } else if (route?.path === '/portfolios') {
          console.log(`   🎯 User Experience: Direct access to portfolios page`);
        }

      } catch (error) {
        console.error(`   ❌ Error: ${error}`);
      }
    }

    // Restore original mock functions
    mockAdminService.isWaitlistEnabled = originalIsWaitlistEnabled;
    mockAdminService.isAutoAddToWaitlistEnabled = originalIsAutoAddEnabled;
  }

  console.log('\n✨ Signup Flow Demonstration Complete!');
  console.log('\nKey Points:');
  console.log('• Admin users always get immediate access');
  console.log('• Auto-waitlist enabled: Users are automatically added to waitlist');
  console.log('• Auto-waitlist disabled: Users go to signup-info page first');
  console.log('• Waitlist disabled: All users get immediate access');
  console.log('• Pending users are directed to complete profile setup');
}

// Export for use in tests or manual execution
export {
  mockUserService,
  mockAdminService,
  mockWaitlistService,
  mockUserRouting,
};
