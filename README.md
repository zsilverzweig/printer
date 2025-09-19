# Printer Project

This repository houses all company planning documents and code for the Printer AI research engine project.

## Printer Project Outline

### 1. Vision

- Build an AI research engine that produces actionable, company-level investment theses.
- Start with a core top-down thesis: AI changes everything.
- Map which companies are positively vs. negatively impacted by AI, then size positions accordingly.
- Differentiate by using structured reasoning + adversarial checks, not one-shot prompts or news scraping.

⸻

### 2. Guiding Principles (Decision Cycle Rules)

1. Every position must have a thesis + catalyst + time horizon (6–9 mo).
2. Adversarial testing is required; every thesis needs disconfirmers.
3. Risk first: size, correlation, and kill-switches built in.
4. Adaptation > prediction: re-run cycles when narratives shift.
5. Maintain continuity: every new thesis references or supersedes the last.

⸻

### 3. Operating Model

#### 3.1. High-Level Scoping

- Agents sweep sectors for AI exposure.
- Classify companies as AI-positive, AI-negative, or neutral.
- Build a living map of the AI impact landscape.

#### 3.2. Company Research Units (CRUs)

Each company has a mini-agent team that runs the Printer Decision Cycle:

- **Business Fundamentals** – revenue streams, margin impact.
- **Product / Pipeline** – AI-related initiatives, adoption timelines.
- **Management & Strategy** – credibility of AI investments.
- **Narrative** – investor sentiment, analyst chatter.
- **Risk** – structural vulnerabilities, regulatory exposure.
- **Counterpoint** – stress-tests the bull case.

Output: A Company Dossier with thesis, catalysts, risks, confidence, and kill switches.

#### 3.3. Senior Management Layer

- **Global Risk Manager** – checks concentration, cross-sector exposures.
- **Global Narrative Manager** – maps system-wide stories (e.g., "chips bottleneck").
- **Macro Manager** – adjusts for policy, rates, geopolitics.
- **Portfolio Synthesizer (PM)** – decides final allocations.

⸻

### 4. Deliverables

- **Company Dossiers** – structured research documents for each name.
- **AI Landscape Map** – overview of sector winners/losers.
- **Portfolio Actions** – adds/trims/exits with rationale.
- **Kill-Switch List** – pre-set triggers for exiting positions.
- **Cycle Log** – append-only record of theses, evidence, and updates.

⸻

### 5. Cadence

- **Quarterly**: Full landscape refresh.
- **Monthly**: Dossier updates for top 20 AI-exposed companies.
- **Weekly**: Each CRU runs a cycle; managers synthesize updates.
- **Event-driven**: Extra cycle on catalysts (earnings, product launches, trial readouts, regulation).

⸻

### 6. Edge

- Not competing on speed of data, but on structured reasoning + continuity.
- Every thesis is transparent, adversarially tested, and auditable.
- Scaling edge comes from being able to run parallel company deep dives with consistent quality.
