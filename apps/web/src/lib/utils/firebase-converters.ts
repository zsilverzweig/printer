// Firebase serialization/deserialization utilities
import { Timestamp } from "firebase/firestore";

// ============================================================================
// TYPE HELPERS
// ============================================================================

// Convert Firebase Timestamp to Date
export const timestampToDate = (
  timestamp: Timestamp | Date | null | undefined
): Date => {
  if (!timestamp) return new Date();
  if (timestamp instanceof Date) return timestamp;
  if (timestamp.toDate) return timestamp.toDate();
  return new Date();
};

// Convert Date to Firebase Timestamp (for writing to Firestore)
export const dateToTimestamp = (
  date: Date | null | undefined
): Timestamp | null => {
  if (!date) return null;
  return Timestamp.fromDate(date);
};

// Safe string conversion with fallback
export const safeString = (value: any, fallback = ""): string => {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
};

// Safe number conversion with fallback
export const safeNumber = (value: any, fallback = 0): number => {
  if (typeof value === "number" && !isNaN(value)) return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    if (!isNaN(parsed)) return parsed;
  }
  return fallback;
};

// Safe boolean conversion with fallback
export const safeBoolean = (value: any, fallback = false): boolean => {
  if (typeof value === "boolean") return value;
  if (value === null || value === undefined) return fallback;
  return Boolean(value);
};

// Safe array conversion with fallback
export const safeArray = <T>(value: any, fallback: T[] = []): T[] => {
  if (Array.isArray(value)) return value;
  return fallback;
};

// Safe object conversion with fallback
export const safeObject = (value: any, fallback = {}): Record<string, any> => {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value;
  }
  return fallback;
};

// ============================================================================
// GENERIC CONVERTERS
// ============================================================================

export interface FirebaseDocument {
  id: string;
  data: () => any;
}

// Generic converter for documents with timestamps
export interface TimestampedDocument {
  createdAt: Date;
  updatedAt: Date;
  [key: string]: any;
}

export const convertTimestampedDocument = <T extends TimestampedDocument>(
  doc: FirebaseDocument,
  customFields: (data: any) => Partial<T> = () => ({})
): T => {
  const data = doc.data();

  return {
    id: doc.id,
    createdAt: timestampToDate(data.createdAt),
    updatedAt: timestampToDate(data.updatedAt),
    ...customFields(data),
  } as unknown as T;
};

// Generic converter for simple documents
export const convertDocument = <T>(
  doc: FirebaseDocument,
  customFields: (data: any) => Partial<T> = () => ({})
): T => {
  const data = doc.data();

  return {
    id: doc.id,
    ...customFields(data),
  } as T;
};

// ============================================================================
// SPECIFIC CONVERTERS
// ============================================================================

import { PortfolioPosition } from "@/features/finance/portfolio/types";

// Portfolio converter
export interface PortfolioDocument extends TimestampedDocument {
  id: string;
  name: string;
  description: string;
  thesis: string;
  positions: PortfolioPosition[];
  marketContext?: string;
  userId: string;
  isActive: boolean;
  status: string;
  assignedAgents: any[];
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export const convertPortfolioDocument = (
  doc: FirebaseDocument
): PortfolioDocument => {
  return convertTimestampedDocument<PortfolioDocument>(doc, (data) => ({
    name: safeString(data.name),
    description: safeString(data.description),
    thesis: safeString(data.thesis),
    positions: safeArray(data.positions),
    marketContext: safeString(data.marketContext),
    userId: safeString(data.userId),
    isActive: safeBoolean(data.isActive, true),
    status: safeString(data.status, "completed"),
    assignedAgents: safeArray(data.assignedAgents),
    metadata: safeObject(data.metadata),
  }));
};

// User converter
export interface UserDocument extends TimestampedDocument {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  emailVerified: boolean;
  status: string;
  role: string;
  preferences: Record<string, any>;
  metadata: Record<string, any>;
}

export const convertUserDocument = (doc: FirebaseDocument): UserDocument => {
  return convertTimestampedDocument<UserDocument>(doc, (data) => ({
    uid: safeString(data.uid),
    email: safeString(data.email),
    displayName: safeString(data.displayName) || undefined,
    photoURL: safeString(data.photoURL) || undefined,
    emailVerified: safeBoolean(data.emailVerified),
    status: safeString(data.status),
    role: safeString(data.role),
    preferences: safeObject(data.preferences),
    metadata: safeObject(data.metadata),
  }));
};

// ============================================================================
// SERIALIZATION HELPERS
// ============================================================================

// Convert object for Firestore storage
export const serializeForFirestore = (obj: any): any => {
  if (obj === null || obj === undefined) return null;

  if (Array.isArray(obj)) {
    return obj.map(serializeForFirestore);
  }

  if (obj instanceof Date) {
    return dateToTimestamp(obj);
  }

  if (typeof obj === "object") {
    const serialized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      serialized[key] = serializeForFirestore(value);
    }
    return serialized;
  }

  return obj;
};

// Convert Firestore data back to JavaScript types
export const deserializeFromFirestore = (obj: any): any => {
  if (obj === null || obj === undefined) return obj;

  if (Array.isArray(obj)) {
    return obj.map(deserializeFromFirestore);
  }

  if (obj && typeof obj === "object" && obj.toDate) {
    // Firebase Timestamp
    return obj.toDate();
  }

  if (typeof obj === "object") {
    const deserialized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      deserialized[key] = deserializeFromFirestore(value);
    }
    return deserialized;
  }

  return obj;
};
