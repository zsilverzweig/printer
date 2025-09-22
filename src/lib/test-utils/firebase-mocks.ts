// Firebase mocking utilities

import type { MockWaitlistEntry } from "./test-utils";

// Mock Firebase Firestore functions
export const createFirebaseMocks = () => {
  const mockAddDoc = jest.fn();
  const mockGetDoc = jest.fn();
  const mockGetDocs = jest.fn();
  const mockUpdateDoc = jest.fn();
  const mockOnSnapshot = jest.fn();
  const mockQuery = jest.fn();
  const mockWhere = jest.fn();
  const mockCollection = jest.fn();
  const mockDoc = jest.fn();
  const mockWriteBatch = jest.fn();
  const mockServerTimestamp = jest.fn(() => new Date());
  const mockIncrement = jest.fn((value) => ({ increment: value }));

  // Setup default mock implementations
  mockQuery.mockReturnValue({});
  mockWhere.mockReturnValue({});
  mockCollection.mockReturnValue({});
  mockDoc.mockReturnValue({});
  mockWriteBatch.mockReturnValue({
    update: jest.fn(),
    commit: jest.fn(),
  });

  return {
    mockAddDoc,
    mockGetDoc,
    mockGetDocs,
    mockUpdateDoc,
    mockOnSnapshot,
    mockQuery,
    mockWhere,
    mockCollection,
    mockDoc,
    mockWriteBatch,
    mockServerTimestamp,
    mockIncrement,
  };
};

// Helper to create mock Firestore document
export const createMockFirestoreDoc = (data: any, id = "doc-123") => ({
  id,
  ref: { id },
  data: () => ({
    ...data,
    // Convert Date objects to Firebase Timestamps
    joinedAt: data.joinedAt
      ? { toDate: () => data.joinedAt, toMillis: () => data.joinedAt.getTime() }
      : null,
    createdAt: data.createdAt ? { toDate: () => data.createdAt } : null,
    updatedAt: data.updatedAt ? { toDate: () => data.updatedAt } : null,
    lastActionAt: data.lastActionAt
      ? { toDate: () => data.lastActionAt }
      : null,
  }),
});

// Helper to create mock Firestore snapshot
export const createMockSnapshot = (docs: any[], empty = false) => ({
  empty,
  docs,
  size: docs.length,
});

// Helper to setup successful waitlist entry retrieval
export const setupMockWaitlistEntry = (
  mocks: ReturnType<typeof createFirebaseMocks>,
  entry: MockWaitlistEntry
) => {
  const mockDoc = createMockFirestoreDoc(entry, entry.id);
  const mockSnapshot = createMockSnapshot([mockDoc]);
  mocks.mockGetDocs.mockResolvedValue(mockSnapshot);
  return mockDoc;
};

// Helper to setup empty waitlist entry (user not found)
export const setupMockEmptyWaitlist = (
  mocks: ReturnType<typeof createFirebaseMocks>
) => {
  const mockSnapshot = createMockSnapshot([], true);
  mocks.mockGetDocs.mockResolvedValue(mockSnapshot);
};

// Helper to setup successful waitlist join
export const setupMockWaitlistJoin = (
  mocks: ReturnType<typeof createFirebaseMocks>,
  entryId = "new-entry-123"
) => {
  const mockDocRef = { id: entryId };
  const mockSnapshot = createMockSnapshot([]); // Empty for new user
  mocks.mockGetDocs.mockResolvedValue(mockSnapshot);
  mocks.mockAddDoc.mockResolvedValue(mockDocRef);
  return mockDocRef;
};

// Helper to setup real-time listener
export const setupMockRealtimeListener = (
  mocks: ReturnType<typeof createFirebaseMocks>,
  entry: MockWaitlistEntry | null,
  unsubscribeFn = jest.fn()
) => {
  mocks.mockOnSnapshot.mockImplementation((query, callback) => {
    if (entry) {
      const mockDoc = createMockFirestoreDoc(entry, entry.id);
      const mockSnapshot = createMockSnapshot([mockDoc]);
      callback(mockSnapshot);
    } else {
      const mockSnapshot = createMockSnapshot([], true);
      callback(mockSnapshot);
    }
    return unsubscribeFn;
  });
  return unsubscribeFn;
};

// Helper to setup batch operations
export const setupMockBatch = (
  mocks: ReturnType<typeof createFirebaseMocks>
) => {
  const mockBatch = {
    update: jest.fn(),
    commit: jest.fn().mockResolvedValue(undefined),
  };
  mocks.mockWriteBatch.mockReturnValue(mockBatch);
  return mockBatch;
};

// Setup all Firebase mocks for Jest
export const setupFirebaseMocks = () => {
  const mocks = createFirebaseMocks();

  // Mock Firebase modules
  jest.mock("firebase/firestore", () => ({
    addDoc: mocks.mockAddDoc,
    getDoc: mocks.mockGetDoc,
    getDocs: mocks.mockGetDocs,
    updateDoc: mocks.mockUpdateDoc,
    onSnapshot: mocks.mockOnSnapshot,
    query: mocks.mockQuery,
    where: mocks.mockWhere,
    collection: mocks.mockCollection,
    doc: mocks.mockDoc,
    writeBatch: mocks.mockWriteBatch,
    serverTimestamp: mocks.mockServerTimestamp,
    increment: mocks.mockIncrement,
    getFirestore: jest.fn(() => ({})),
  }));

  jest.mock("firebase/auth", () => ({
    getAuth: jest.fn(() => ({})),
  }));

  jest.mock("firebase/app", () => ({
    initializeApp: jest.fn(() => ({})),
  }));

  jest.mock("@/lib/services/firebase", () => ({
    db: {},
    auth: {},
  }));

  jest.mock("@/lib/utils/logger", () => ({
    log: {
      success: jest.fn(),
      failure: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
    },
  }));

  return mocks;
};
