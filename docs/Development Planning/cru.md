# Company Research Unit (CRU) Implementation

## Overview

Implement the core Company Research Unit system that analyzes companies using 6 specialized agents working together to produce comprehensive investment theses.

## CRU System Architecture

### The 6-Agent Analysis Framework

Each company gets analyzed by a dedicated team of 6 agents:

1. **Business Fundamentals Agent**

   - Revenue streams and growth analysis
   - Margin trends and profitability
   - Market position and competitive moats
   - Financial health and balance sheet strength

2. **Product/Pipeline Agent**

   - AI-related initiatives and investments
   - Product roadmap and innovation pipeline
   - Technology adoption and implementation
   - Competitive advantages in AI space

3. **Management & Strategy Agent**

   - Leadership credibility and track record
   - Strategic vision and execution capability
   - AI investment commitment and resources
   - Corporate culture and innovation focus

4. **Narrative Agent**

   - Market sentiment and analyst coverage
   - Investor expectations and positioning
   - Media coverage and public perception
   - Story consistency and believability

5. **Risk Agent**

   - Structural vulnerabilities and threats
   - Regulatory exposure and compliance risks
   - Market risks and competitive threats
   - Execution risks and operational challenges

6. **Counterpoint Agent**
   - Stress-test the bullish thesis
   - Identify bearish arguments and concerns
   - Challenge assumptions and find weaknesses
   - Provide balanced perspective

## CRU Workflow

### Phase 1: Data Gathering

- Collect company financial data (Yahoo Finance API)
- Scrape SEC filings and investor materials
- Gather news sentiment and analyst reports
- Build company profile and context

### Phase 2: Parallel Agent Analysis

- All 6 agents analyze company simultaneously
- Each agent focuses on their specialized domain
- Agents share key findings with each other
- Build comprehensive understanding

### Phase 3: Consensus Building

- Resolve conflicts between agent perspectives
- Identify areas of agreement and disagreement
- Weight different viewpoints based on confidence
- Build unified understanding

### Phase 4: Thesis Generation

- Create investment thesis with clear catalyst
- Define time horizon (6-18 months)
- Identify key risks and kill-switches
- Assign confidence level and rationale

### Phase 5: Quality Assurance

- Validate completeness of analysis
- Check for logical consistency
- Ensure all key factors considered
- Finalize company dossier

## Company Dossier Output

### Structured Format

```typescript
interface CompanyDossier {
  company: {
    symbol: string;
    name: string;
    sector: string;
    marketCap: number;
  };
  thesis: {
    recommendation: "BUY" | "SELL" | "HOLD";
    catalyst: string;
    timeHorizon: string;
    confidence: number; // 1-10
    rationale: string;
  };
  analysis: {
    businessFundamentals: AgentAnalysis;
    productPipeline: AgentAnalysis;
    managementStrategy: AgentAnalysis;
    narrative: AgentAnalysis;
    risk: AgentAnalysis;
    counterpoint: AgentAnalysis;
  };
  risks: {
    primary: string[];
    secondary: string[];
    killSwitches: string[];
  };
  catalysts: {
    primary: string;
    secondary: string[];
    timeline: string;
  };
  consensus: {
    agreement: string[];
    disagreement: string[];
    confidence: number;
  };
}
```

## Implementation Details

### CRU Service

- **CompanyAnalysisService** - Orchestrate CRU analysis
- **DataGatheringService** - Collect company information
- **ConsensusBuilder** - Resolve agent conflicts
- **DossierGenerator** - Create final company dossier
- **QualityAssurance** - Validate analysis completeness

### Data Integration

- **Yahoo Finance API** - Real-time financial data
- **SEC EDGAR Scraping** - Company filings and documents
- **News Sentiment** - Market sentiment analysis
- **Vector Embeddings** - Semantic search and similarity

## Success Criteria

- CRU produces comprehensive company dossiers
- Analysis quality is consistent across companies
- All 6 agents contribute meaningful insights
- Consensus building resolves conflicts effectively
- System can analyze 10+ companies in parallel
- Dossiers include clear investment recommendations
