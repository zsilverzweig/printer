# Agent Team System

## Overview

Build a system for creating agent teams, defining collaboration patterns, and engaging teams on problems. This enables the Company Research Unit (CRU) system.

## Core Features

### Team Builder UI

- **Visual Team Designer** - Drag-and-drop interface for team composition
- **Workflow Designer** - Define how agents collaborate (sequential, parallel, consensus)
- **Team Templates** - Pre-built configurations for common use cases
- **Real-time Testing** - Test team execution immediately

### Team Configuration

- **Team Composition** - Select and configure individual agents
- **Workflow Definition** - Task sequence, dependencies, and handoffs
- **Output Schema** - Expected team deliverable format
- **Quality Gates** - Success criteria and validation rules
- **Error Handling** - Retry logic and failure recovery

### Team Execution Engine

- **Problem Engagement** - Submit problems to teams via API/UI
- **Execution Monitoring** - Real-time progress tracking
- **Inter-Agent Communication** - Information sharing between agents
- **Consensus Building** - Resolve conflicts between agents
- **Output Synthesis** - Combine individual outputs into team deliverables

## CRU Team Template

### The 6-Agent Company Research Unit

1. **Business Fundamentals Agent** - Revenue streams, margins, growth
2. **Product/Pipeline Agent** - AI initiatives, adoption timelines
3. **Management & Strategy Agent** - Leadership credibility, strategic direction
4. **Narrative Agent** - Market sentiment, analyst coverage
5. **Risk Agent** - Structural vulnerabilities, regulatory exposure
6. **Counterpoint Agent** - Stress-test the bull case

### CRU Workflow

1. **Parallel Analysis** - All 6 agents analyze company simultaneously
2. **Information Sharing** - Agents share key findings with each other
3. **Consensus Building** - Resolve conflicts between agent perspectives
4. **Synthesis** - Combine insights into comprehensive company dossier
5. **Quality Check** - Validate completeness and consistency

## Implementation Details

### Data Model

```typescript
interface AgentTeam {
  id: string;
  name: string;
  description: string;
  agents: Agent[];
  workflow: WorkflowStep[];
  outputSchema: JSONSchema;
  qualityGates: QualityGate[];
  errorHandling: ErrorHandlingConfig;
  version: string;
}

interface WorkflowStep {
  id: string;
  type: "sequential" | "parallel" | "consensus";
  agents: string[];
  dependencies: string[];
  handoffData: string[];
}
```

### Key Components

- **TeamService** - CRUD operations for teams
- **WorkflowEngine** - Execute team workflows
- **CommunicationHub** - Inter-agent message passing
- **ConsensusBuilder** - Resolve agent conflicts
- **OutputSynthesizer** - Combine agent outputs

## Success Criteria

- Create CRU team in under 10 minutes
- Teams execute workflows reliably
- Inter-agent communication works seamlessly
- Output quality is consistent and comprehensive
- System handles 10+ concurrent team executions
