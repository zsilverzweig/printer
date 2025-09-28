# Technical Architecture

## System Overview

Printer is built as a Next.js 14 web application with Firebase backend, orchestrating a multi-agent AI system for investment research and decision-making. The system uses TypeScript throughout with a modern React-based frontend and serverless backend architecture.

## Architecture Stack

### Frontend & UI Framework

- **Next.js 14** - React-based web interface with App Router
- **React 18** - Modern React with hooks and concurrent features
- **TypeScript** - Full type safety across the application
- **Tailwind CSS** - Utility-first CSS framework for styling
- **Radix UI** - Accessible component primitives (dialogs, dropdowns, etc.)
- **ShadCN/UI** - Pre-built component library with consistent design system
- **Lucide React** - Icon library for consistent iconography

### Backend & Data

- **Next.js API Routes** - Serverless API endpoints (TypeScript)
- **Firebase Firestore** - Primary NoSQL database with real-time capabilities
- **Firebase Authentication** - Google OAuth and user management
- **Firebase Hosting** - Static site deployment and CDN
- **Event-based Architecture** - Real-time updates for portfolio and agent status

### AI & ML Infrastructure

- **OpenAI GPT Models** - Primary AI reasoning engines
  - GPT-4o (128k context, vision, function calling)
  - GPT-4o-mini (cost-optimized for high-volume tasks)
  - GPT-4-turbo (high-quality analysis)
  - GPT-3.5-turbo (basic tasks)
- **Custom Agent System** - TypeScript-based agent orchestration
- **Cost Monitoring** - Real-time AI usage tracking and budgeting
- **Model Selection** - Dynamic model selection based on task complexity and cost

### External APIs & Data Sources

#### Currently Integrated
- **Alpaca Markets API** - Paper and live trading, account management, real-time quotes
- **OpenAI API** - GPT models for AI reasoning and analysis
- **Stripe API** - Payment processing for subscriptions and upgrades
- **Sentry** - Error tracking and performance monitoring

#### Planned Integration (Phase 1)
- **SEC EDGAR API** - Free access to SEC filings (10-K, 10-Q, 8-K)
- **Web Search APIs** - Google Search API for recent company news
- **News APIs** - Financial news aggregation and sentiment analysis
- **Financial Data APIs** - Yahoo Finance, Alpha Vantage for market data

#### Future Data Sources (Phase 2+)
- **Premium Market Data** - Bloomberg Terminal API, IEX Cloud
- **Professional News** - Reuters, AP, financial news APIs
- **Alternative Data** - Glassdoor, GitHub, Patent databases
- **Real-time Feeds** - High-frequency market data, live news streams

### Development & Deployment

- **Next.js Build System** - Optimized production builds with TypeScript
- **Firebase CLI** - Backend deployment and management
- **Jest** - Testing framework with React Testing Library
- **ESLint** - Code linting and formatting
- **Git** - Version control and collaboration

## Agent Architecture

### Current Implementation

**Predefined Agent Archetypes**
- **Portfolio Manager** - Transforms theses into trade-ready positions
- **Business Fundamentals Agent** - Analyzes revenue, margins, growth metrics
- **Risk Assessment Agent** - Identifies and quantifies investment risks
- **Narrative Analyst** - Analyzes market sentiment and investment narratives
- **Counterpoint Agent** - Provides adversarial testing and challenges
- **Research Analyst** - Conducts comprehensive company research

**Agent System Features**
- **Persistent Context** - Each agent maintains memory of previous analyses
- **Specialized Roles** - Tailored prompts and responsibilities for each archetype
- **Cost Optimization** - Dynamic model selection based on task complexity
- **Real-time Monitoring** - Live tracking of agent performance and costs
- **Error Handling** - Robust error recovery and retry mechanisms

### Agent Configuration

**Core Properties**
- **Role Definition** - Specific responsibilities and expertise areas
- **Prompt Templates** - Structured prompts with variable substitution
- **Model Selection** - GPT-4o, GPT-4o-mini, GPT-4-turbo, GPT-3.5-turbo
- **Temperature Settings** - Optimized for different analysis types
- **Token Limits** - Cost-aware token management
- **Output Schemas** - Structured JSON responses for consistent parsing

### Cost Management & Monitoring

**Real-time Cost Tracking**
- **Daily/Hourly Limits** - Configurable cost thresholds
- **Per-request Limits** - Individual request cost controls
- **Token Usage Tracking** - Detailed token consumption monitoring
- **Model Cost Optimization** - Automatic model selection based on budget

**Cost Monitoring Features**
- **Real-time Alerts** - Notifications when approaching limits
- **Cost Analytics** - Detailed breakdown by agent, operation, and user
- **Budget Management** - Automatic throttling when limits exceeded
- **Historical Tracking** - Cost trends and optimization insights

**Model Selection Strategy**
- **GPT-4o** - High-complexity analysis and reasoning
- **GPT-4o-mini** - Cost-effective for routine tasks
- **GPT-4-turbo** - Balanced quality and cost for standard analysis
- **GPT-3.5-turbo** - Basic tasks and simple operations

### Agent Team System

**Team Builder UI**

- Visual interface for creating and configuring agent teams
- Team composition and workflow designer
- Collaboration pattern configuration
- Team template library

**Team Configuration**

- Team composition and agent selection
- Workflow definition and task dependencies
- Output schema specification
- Quality gates and validation criteria
- Error handling and retry logic

**Team Execution Engine**

- Problem engagement interface
- Real-time execution monitoring
- Inter-agent communication protocols
- Consensus building mechanisms
- Output synthesis and delivery

### Agent Types

**Company Research Units (CRUs)**

- Business Fundamentals Agent
- Product/Pipeline Agent
- Management & Strategy Agent
- Narrative Agent
- Risk Agent
- Counterpoint Agent

**Senior Management Layer**

- Global Risk Manager
- Global Narrative Manager
- Macro Manager
- Portfolio Synthesizer
- Performance Analysis Group

## Data Flow

```
External APIs (Alpaca, OpenAI) → Next.js API Routes → Firebase Firestore
                    ↓
            Custom Agent Orchestration (TypeScript)
                    ↓
            Event Logging → Firestore Collections
                    ↓
            Real-time Updates → Next.js Dashboard
```

## Database Schema

**Firestore Collections:**
- **agents** - Agent configurations and metadata
- **portfolios** - Portfolio data and positions
- **company_research** - Research reports and analysis
- **agent_work** - Agent execution history and results
- **ai_requests** - AI API request logging
- **ai_responses** - AI response caching
- **cost_entries** - Cost tracking and monitoring
- **user_sessions** - User activity and preferences

**Data Model Features:**
- **Real-time Updates** - Live dashboard updates via Firestore listeners
- **Structured Data** - TypeScript interfaces for type safety
- **Audit Trail** - Complete history of all decisions and actions
- **Caching** - Response caching for performance optimization
- **Cost Tracking** - Detailed cost monitoring and analytics

## Environment Configuration

### Required Environment Variables

**Firebase Configuration:**
```bash
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your_measurement_id
```

**AI Services:**
```bash
OPENAI_API_KEY=your_openai_api_key
```

**Trading Integration:**
```bash
ALPACA_CLIENT_ID=your_alpaca_client_id
ALPACA_CLIENT_SECRET=your_alpaca_client_secret
ALPACA_API_BASE_URL=https://api.alpaca.markets
ALPACA_PAPER_API_BASE_URL=https://paper-api.alpaca.markets
```

**Payment Processing:**
```bash
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

**Monitoring & Security:**
```bash
NEXT_PUBLIC_SENTRY_DSN=your_sentry_dsn
SENTRY_AUTH_TOKEN=your_sentry_auth_token
JWT_SECRET=your_jwt_secret
ADMIN_API_KEY=your_admin_api_key
```

**Cost Management:**
```bash
DAILY_COST_LIMIT=50
HOURLY_COST_LIMIT=10
PER_REQUEST_COST_LIMIT=5
```

## Development Phases

### Phase 1: Current MVP ✅ COMPLETED

- ✅ Next.js 14 with TypeScript and modern React
- ✅ Firebase Firestore for data persistence
- ✅ OpenAI GPT models for AI reasoning
- ✅ Alpaca Markets integration for trading
- ✅ Stripe integration for payments
- ✅ Real-time dashboard with live updates
- ✅ Cost monitoring and budget controls

### Phase 2: Enhanced Research 🚧 IN PROGRESS

- 🚧 SEC EDGAR API integration for filings
- 🚧 Web search integration for current information
- 🚧 Enhanced company research capabilities
- 🚧 Multi-source data synthesis
- 🚧 Advanced research output with source attribution

### Phase 3: Scale & Optimization 🚧 PLANNED

- 🚧 Advanced caching and performance optimization
- 🚧 Enhanced monitoring and analytics
- 🚧 Automated trade execution
- 🚧 Advanced portfolio management features

## Security & Compliance

- **Firebase Security Rules** - Database access control and user permissions
- **API Key Management** - Secure external API integration with environment variables
- **OAuth Integration** - Secure Alpaca account linking with token management
- **Audit Logging** - Complete decision trail and user activity tracking
- **Data Encryption** - At rest and in transit via Firebase and HTTPS
- **Rate Limiting** - Built-in rate limiting for API endpoints and AI requests

## Performance Considerations

- **Real-time Updates** - Firebase real-time listeners for live dashboard updates
- **Response Caching** - AI response caching to reduce costs and improve performance
- **Cost Optimization** - Smart model selection and token usage optimization
- **API Rate Limiting** - Respect external service limits (Alpaca, OpenAI)
- **Error Handling** - Robust error recovery and retry mechanisms
- **Loading States** - Optimistic UI updates for better user experience

## Monitoring & Observability

- **Sentry Integration** - Error tracking and performance monitoring
- **Cost Monitoring** - Real-time AI usage tracking and budget alerts
- **Firebase Analytics** - User behavior and system usage analytics
- **Performance Metrics** - Agent response times and accuracy tracking
- **Business Metrics** - Portfolio performance and decision quality monitoring
- **Debug Logging** - Comprehensive logging for development and troubleshooting
