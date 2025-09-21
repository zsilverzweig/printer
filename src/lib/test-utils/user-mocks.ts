// User authentication and profile mocking utilities

// Mock Firebase Auth types
export interface MockAuthUser {
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
  providerData: Array<{
    providerId: string;
    uid: string;
    displayName: string | null;
    email: string | null;
    photoURL: string | null;
  }>;
  refreshToken: string;
  tenantId: string | null;
  delete: jest.Mock;
  getIdToken: jest.Mock;
  getIdTokenResult: jest.Mock;
  reload: jest.Mock;
  toJSON: jest.Mock;
}

// Mock Auth Context
export interface MockAuthContext {
  user: MockAuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  signIn: jest.Mock;
  signOut: jest.Mock;
  signUp: jest.Mock;
}

// Factory functions for creating mock auth users
export const createMockAuthUser = (
  overrides: Partial<MockAuthUser> = {}
): MockAuthUser => ({
  uid: "test-user-123",
  email: "test@example.com",
  displayName: "Test User",
  photoURL: null,
  emailVerified: true,
  isAnonymous: false,
  metadata: {
    creationTime: "2023-01-01T00:00:00Z",
    lastSignInTime: "2023-01-01T00:00:00Z",
  },
  providerData: [
    {
      providerId: "google.com",
      uid: "test-user-123",
      displayName: "Test User",
      email: "test@example.com",
      photoURL: null,
    },
  ],
  refreshToken: "mock-refresh-token",
  tenantId: null,
  delete: jest.fn().mockResolvedValue(undefined),
  getIdToken: jest.fn().mockResolvedValue("mock-id-token"),
  getIdTokenResult: jest.fn().mockResolvedValue({
    token: "mock-id-token",
    expirationTime: "2023-12-31T23:59:59Z",
    issuedAtTime: "2023-01-01T00:00:00Z",
    signInProvider: "google.com",
    signInSecondFactor: null,
    claims: {},
  }),
  reload: jest.fn().mockResolvedValue(undefined),
  toJSON: jest.fn().mockReturnValue({}),
});

// Factory for creating mock auth context
export const createMockAuthContext = (
  overrides: Partial<MockAuthContext> = {}
): MockAuthContext => ({
  user: createMockAuthUser(),
  isAuthenticated: true,
  isLoading: false,
  error: null,
  signIn: jest.fn().mockResolvedValue(undefined),
  signOut: jest.fn().mockResolvedValue(undefined),
  signUp: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

// Predefined user scenarios
export const authTestScenarios = {
  // Authenticated user
  authenticated: () =>
    createMockAuthContext({
      user: createMockAuthUser(),
      isAuthenticated: true,
      isLoading: false,
    }),

  // Unauthenticated user
  unauthenticated: () =>
    createMockAuthContext({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    }),

  // Loading state
  loading: () =>
    createMockAuthContext({
      user: null,
      isAuthenticated: false,
      isLoading: true,
    }),

  // Error state
  error: (errorMessage: string = "Authentication failed") =>
    createMockAuthContext({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: errorMessage,
    }),

  // Admin user
  admin: () =>
    createMockAuthContext({
      user: createMockAuthUser({
        email: "admin@printer.com",
        displayName: "Admin User",
      }),
      isAuthenticated: true,
      isLoading: false,
    }),

  // New user (just signed up)
  newUser: () =>
    createMockAuthContext({
      user: createMockAuthUser({
        uid: "new-user-456",
        email: "newuser@example.com",
        displayName: "New User",
        metadata: {
          creationTime: new Date().toISOString(),
          lastSignInTime: new Date().toISOString(),
        },
      }),
      isAuthenticated: true,
      isLoading: false,
    }),

  // User with no display name
  noDisplayName: () =>
    createMockAuthContext({
      user: createMockAuthUser({
        displayName: null,
      }),
      isAuthenticated: true,
      isLoading: false,
    }),

  // Anonymous user
  anonymous: () =>
    createMockAuthContext({
      user: createMockAuthUser({
        isAnonymous: true,
        email: null,
        displayName: null,
      }),
      isAuthenticated: true,
      isLoading: false,
    }),
};

// Mock React hook for auth context
export const mockUseAuthContext = (
  scenario: keyof typeof authTestScenarios = "authenticated"
) => {
  const mockContext = authTestScenarios[scenario]();

  return jest.fn().mockReturnValue(mockContext);
};

// Helper to setup auth context mock for tests
export const setupAuthMock = (
  scenario: keyof typeof authTestScenarios = "authenticated"
) => {
  const mockAuthContext = authTestScenarios[scenario]();

  jest.mock("@/lib/providers/auth-provider", () => ({
    useAuthContext: jest.fn().mockReturnValue(mockAuthContext),
  }));

  return mockAuthContext;
};

// Helper to mock user profile data
export const createMockUserProfile = (overrides: any = {}) => ({
  id: "test-user-123",
  email: "test@example.com",
  displayName: "Test User",
  status: "active",
  role: "user",
  isEmailVerified: true,
  lastLoginAt: new Date("2023-01-01T00:00:00Z"),
  createdAt: new Date("2023-01-01T00:00:00Z"),
  updatedAt: new Date("2023-01-01T00:00:00Z"),
  preferences: {
    theme: "light",
    notifications: true,
    language: "en",
  },
  metadata: {
    signupSource: "google",
    lastActiveAt: new Date("2023-01-01T00:00:00Z"),
    sessionCount: 1,
    totalSessionTime: 0,
  },
  ...overrides,
});

// Helper to mock waitlist-specific user data
export const createMockUserWithWaitlist = (waitlistData: any = {}) => ({
  ...createMockUserProfile(),
  waitlistEntryId: "waitlist-entry-123",
  waitlistPosition: 5,
  ...waitlistData,
});

// Mock service responses
export const mockUserServiceResponses = {
  createProfile: jest.fn().mockResolvedValue(createMockUserProfile()),
  getProfile: jest.fn().mockResolvedValue(createMockUserProfile()),
  updateProfile: jest.fn().mockResolvedValue(createMockUserProfile()),
  deleteProfile: jest.fn().mockResolvedValue(undefined),
};
