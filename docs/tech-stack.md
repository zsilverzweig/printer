# Technical Architecture

## System Overview

Printer is built as a Next.js web application with Firebase backend, orchestrating a multi-agent AI system for investment research and decision-making.

## Architecture Stack

### Frontend & Orchestration

- **Next.js** - React-based web interface for monitoring and control
- **Firebase Hosting** - Static site deployment
- **Real-time updates** - Live portfolio monitoring and agent status

### Backend & Data

- **Firebase Functions** - Serverless API endpoints (TypeScript)
- **Firestore** - Primary database with native vector search capabilities
- **Event Logging** - Simple event-based data model for trades and decisions
- **Firebase Authentication** - User management and security

### AI & ML Infrastructure

- **Multi-Agent System** - Custom-built specialized AI agents with persistent context
- **Custom Orchestration** - TypeScript-based agent coordination (no external frameworks initially)
- **Vector Database** - Firestore's native vector search for semantic similarity
- **OpenAI GPT-4/Claude** - Primary reasoning engines with built-in market knowledge
- **Local Models** - Llama 3/Mistral for cost-sensitive operations
- **AI-First Approach** - Leverage LLM training data for company analysis and sector insights

### Data Sources & APIs (Phase 1 - Free/Low-Cost)

- **AI Model Knowledge** - GPT-4/Claude training data for company analysis and sector knowledge (primary source)
- **Public Financial Data** - Yahoo Finance API (free), SEC EDGAR (free), company websites
- **News & Sentiment** - RSS feeds, public news APIs, social media scraping
- **Web Scraping** - Company investor relations pages, earnings transcripts, press releases
- **Open Data** - Government economic data, industry reports, academic research

### Future Data Sources (Phase 2+)

- **Premium Market Data** - Alpha Vantage, IEX Cloud, Bloomberg Terminal API
- **Professional News** - Reuters, AP, financial news APIs
- **Alternative Data** - Glassdoor, GitHub, Patent databases
- **Real-time Feeds** - High-frequency market data, live news streams

### Development & Deployment

- **Vercel** - Frontend deployment and CI/CD
- **Firebase CLI** - Backend deployment and management
- **Git** - Version control and collaboration

## Agent Architecture

### What Makes an "Agent"

- **Persistent Context** - Each agent maintains memory of previous analyses
- **Specialized Role** - Tailored prompts and responsibilities
- **Consistent Approach** - Same agent handles similar situations similarly
- **Learning Capability** - Agents improve over time with more context

### Agent Management System

**Agent Builder UI**

- Visual interface for creating and editing agents
- Drag-and-drop prompt template builder
- Real-time agent testing and validation
- Configuration parameter management

**Agent Configuration**

- Role definition and responsibilities
- Prompt templates with variables
- Context management settings
- Output format schemas
- Performance and error handling settings
- Cost management and model tier selection
- Model compatibility across GPT stack

**Agent Version Control**

- Git-like versioning for agent configurations
- Branching system for experimental variants
- A/B testing framework
- Rollback and deployment management

### Cost Management & Model Compatibility

**Model Tier System**

- GPT-3.5, GPT-4, GPT-4 Turbo, Claude, Llama, etc.
- Seamless switching between model providers
- Cost-aware model selection algorithms
- Development vs production model configurations

**Cost Optimization**

- Real-time cost tracking and budgeting
- Token usage optimization and prompt compression
- Model fallback system for budget limits
- A/B testing across model tiers for cost/quality balance

**Model Compatibility**

- Unified API interface across different models
- Prompt adaptation for model-specific requirements
- Output format standardization
- Performance benchmarking across model tiers

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
External APIs → Firebase Functions → Firestore
                    ↓
            Custom Agent Orchestration (TypeScript)
                    ↓
            Event Logging → Firestore Collections
                    ↓
            Vector Embeddings → Firestore Vector Search
                    ↓
            Next.js Dashboard ← Real-time Updates
```

## Event-Based Data Model

**Simple Event Structure:**

- **Event Types**: TRADE_EXECUTED, THESIS_CREATED, AGENT_ANALYSIS, etc.
- **Event Data**: Structured JSON with relevant context
- **Audit Trail**: Complete history of all decisions and actions
- **Real-time Updates**: Dashboard updates immediately on new events

**Future ETL to SQL:**

- Complex reporting needs will trigger ETL to Cloud SQL
- Maintains simple MVP approach while enabling advanced analytics

## Development Phases

### Phase 1: MVP (Firebase + Next.js)

- Custom-built agent system with TypeScript
- Event-based data model in Firestore
- Simple web interface for monitoring
- Core portfolio tracking with event logging
- Manual trade execution with audit trail

### Phase 2: Scale (Hybrid Architecture)

- Keep Next.js frontend
- Migrate heavy computation to AWS
- Add advanced ML pipelines
- Automated trade execution

### Phase 3: Enterprise (Full AWS)

- Complete migration to AWS infrastructure
- High-frequency trading capabilities
- Advanced analytics and reporting
- Multi-user support

## Security & Compliance

- **Firebase Security Rules** - Database access control
- **API Key Management** - Secure external API integration
- **Audit Logging** - Complete decision trail
- **Data Encryption** - At rest and in transit
- **Compliance Tracking** - Regulatory requirement monitoring

## Performance Considerations

- **Real-time Updates** - Firebase real-time listeners for live data
- **Vector Search Optimization** - Efficient similarity queries
- **Agent Context Management** - Balanced memory vs. performance
- **API Rate Limiting** - Respect external service limits
- **Cost Optimization** - Smart use of paid AI services

## Monitoring & Observability

- **Firebase Analytics** - User behavior and system usage
- **Performance Monitoring** - Agent response times and accuracy
- **Error Tracking** - System failures and recovery
- **Business Metrics** - Portfolio performance and decision quality
