# Product Roadmap

## Overview

This roadmap focuses on building the core Printer system to achieve the Company Research Units (CRU) capability described in our business strategy. We're excluding long-term performance management features to focus on the essential MVP.

## Phase 1: Basic Infrastructure (Weeks 1-2)

**Goal**: Set up the foundational technical infrastructure
//CURSOR THIS IS ALREADY DONE.

- **[Infrastructure Setup](infrastructure.md)** - Firebase + Next.js + ShadCN setup
- **[Basic UI Framework](ui-framework.md)** - Core components and layout system

## Phase 2: Agent Management (Weeks 3-4)

**Goal**: Build the system for creating and managing AI agents

- **[Agent Management System](agent-management.md)** - Create, edit, and version AI agents
- **[Agent Templates](agent-templates.md)** - Pre-built agent configurations

## Phase 3: Agent Teams (Weeks 5-6)

**Goal**: Build the system for creating and managing agent teams

- **[Team System](teams.md)** - Agent team creation and collaboration patterns
- **[Cost Management](cost-management.md)** - Model tier selection and cost optimization

## Phase 4: Company Research (Weeks 7-10)

**Goal**: Implement the Company Research Unit (CRU) system

- **[CRU Implementation](cru.md)** - The 6-agent company analysis system
- **[Data Integration](data-integration.md)** - Yahoo Finance, SEC EDGAR, news sentiment

## Phase 5: Alpaca Integration & Portfolio Management (Weeks 11-14)

**Goal**: Connect to real brokerage for portfolio management and trade execution

- **[Alpaca Integration](alpaca-integration.md)** - Connect to Alpaca Markets API for real trading
- **[Portfolio System](portfolio.md)** - Position tracking and trade execution
- **[Decision Interface](decisions.md)** - Human oversight and approval workflow
- **[Simple GPT Portfolio](gpt-portfolio.md)** - AI-generated portfolio recommendations

### Alpaca Integration Features

- **OAuth Connection** - Users connect their Alpaca accounts to Printer
- **Paper Trading** - Test AI recommendations without real money
- **Real-time Data** - Live market data and portfolio updates
- **Trade Execution** - Execute AI recommendations automatically
- **Portfolio Tracking** - Real-time portfolio performance monitoring
- **Risk Management** - Position sizing and stop-loss automation

### Simple GPT Portfolio System

- **Natural Language Input** - Users describe their investment goals
- **AI Portfolio Generation** - GPT creates diversified portfolio recommendations
- **Risk Assessment** - AI evaluates portfolio risk and suggests adjustments
- **Rebalancing** - Automated portfolio rebalancing recommendations
- **Performance Tracking** - Monitor AI-generated portfolio performance

## Success Criteria

By the end of Phase 5, Printer will be able to:

- Create and manage AI agents with version control
- Build agent teams with defined collaboration patterns
- Analyze companies using the 6-agent CRU system
- Connect to Alpaca Markets for real trading
- Generate AI-powered portfolio recommendations
- Execute trades through connected brokerage accounts
- Track portfolio performance in real-time
- Provide human oversight for all AI decisions

## Phase 6: Trade Pattern Analysis (Weeks 15-18)

**Goal**: Learn from successful trades to generate new investment opportunities

- **Trade Archetype System** - Capture and analyze successful trade patterns
- **Thesis Generation** - Convert trade archetypes into actionable investment theses
- **Pattern Matching** - AI agents find similar opportunities across the market

### Trade Archetype Workflow

1. **Input Trade Archetype** - User describes a successful trade (company, catalyst, outcome)
2. **Vector Embedding** - Convert trade data into high-dimensional vector representation
3. **AI-Guided Analysis** - Agents help identify why the trade was successful using vector similarity
4. **Thesis Generation** - System creates vector-encoded investment thesis from the pattern
5. **Vector Similarity Search** - Agent teams search market using cosine similarity and nearest neighbors
6. **Opportunity Presentation** - Ranked list of potential investments by vector similarity score

### Vector-Based Architecture

- **Embedding Models**: Transform trade data, market data, and theses into vector representations
- **Vector Database**: Store and query high-dimensional embeddings (Pinecone, Weaviate, or similar)
- **Similarity Search**: Fast cosine similarity and nearest neighbor search across all vectors
- **Real-time Vectorization**: Live market data converted to vectors for instant pattern matching

## Future Phases (Post-MVP)

- **Performance Analysis** - System learning and improvement
- **Advanced Analytics** - Portfolio optimization and risk management
- **Production Scaling** - High-frequency trading and enterprise features
