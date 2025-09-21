import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
}

// Initialize Firebase
export const app = initializeApp(firebaseConfig)

// Initialize Firebase services
export const db = getFirestore(app)
export const auth = getAuth(app)

// Collection names
export const COLLECTIONS = {
  AGENTS: 'agents',
  AGENT_TEAMS: 'agent_teams',
  COMPANY_RESEARCH: 'company_research',
  TRADE_ARCHETYPES: 'trade_archetypes',
  INVESTMENT_THESES: 'investment_theses',
  MARKET_OPPORTUNITIES: 'market_opportunities',
  AI_REQUESTS: 'ai_requests',
  AI_RESPONSES: 'ai_responses',
  COST_ENTRIES: 'cost_entries',
  CACHE_ENTRIES: 'cache_entries',
  PERFORMANCE_METRICS: 'performance_metrics',
  USER_SESSIONS: 'user_sessions',
} as const

export type CollectionName = typeof COLLECTIONS[keyof typeof COLLECTIONS]
