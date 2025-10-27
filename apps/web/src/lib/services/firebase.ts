import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Check if Firebase is configured
const isFirebaseConfigured = !!(
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId &&
  firebaseConfig.appId
);

// Initialize Firebase only if configured
export const app: FirebaseApp | null = isFirebaseConfigured
  ? initializeApp(firebaseConfig)
  : null;

// Initialize Firebase services (will be null if not configured)
export const db: Firestore | null = app ? getFirestore(app) : null;
export const auth: Auth | null = app ? getAuth(app) : null;

// Collection names
export const COLLECTIONS = {
  AGENTS: "agents",
  AGENT_TEMPLATES: "agent_templates",
  AGENT_VERSIONS: "agent_versions",
  AGENT_TEAMS: "agent_teams",
  COMPANY_RESEARCH: "company_research",
  PORTFOLIOS: "portfolios",
  AGENT_WORK: "agent_work",
  TRADE_ARCHETYPES: "trade_archetypes",
  INVESTMENT_THESES: "investment_theses",
  MARKET_OPPORTUNITIES: "market_opportunities",
  AI_REQUESTS: "ai_requests",
  AI_RESPONSES: "ai_responses",
  COST_ENTRIES: "cost_entries",
  CACHE_ENTRIES: "cache_entries",
  PERFORMANCE_METRICS: "performance_metrics",
  USER_SESSIONS: "user_sessions",
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];
