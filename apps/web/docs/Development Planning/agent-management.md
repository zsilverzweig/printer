# Agent Management System

## Overview

Build a comprehensive system for creating, editing, and versioning AI agents that will power the Company Research Unit (CRU) system. This is the foundation that enables all other Printer capabilities.

## Core Features

### Agent Builder UI

- **Visual Agent Creator** - Drag-and-drop interface for building agents
- **Prompt Template Editor** - Rich text editor with variable substitution
- **Real-time Testing** - Test agents immediately as you build them
- **Configuration Panel** - All agent settings in one place

### Agent Configuration

- **Role Definition** - Clear description of agent's purpose and responsibilities
- **Prompt Templates** - Structured prompts with variables (e.g., `{company_name}`, `{sector}`)
- **Context Management** - How much history to retain, memory settings
- **Output Schema** - Structured JSON response format with validation
- **Model Settings** - Model selection, temperature, max tokens, cost tier

### Version Control

- **Git-like Versioning** - Track all changes to agent configurations
- **Branching System** - Create experimental agent variants
- **Rollback Capability** - Revert to previous versions instantly
- **A/B Testing** - Compare different agent configurations

## Smart Defaults

### Financial Analysis Templates

- **Business Fundamentals Agent** - Revenue, margins, growth analysis
- **Risk Assessment Agent** - Threat identification and quantification
- **Narrative Agent** - Market sentiment and story analysis
- **Counterpoint Agent** - Adversarial testing and challenge

### Cost Optimization

- **Development Mode** - GPT-3.5 for rapid iteration
- **Production Mode** - GPT-5 for high-quality analysis
- **Automatic Fallback** - Downgrade when budget limits reached

## Implementation Details

### Data Model

```typescript
interface Agent {
  id: string;
  name: string;
  role: string;
  promptTemplate: string;
  outputSchema: JSONSchema;
  modelSettings: {
    provider: "openai" | "anthropic" | "local";
    model: string;
    temperature: number;
    maxTokens: number;
  };
  contextSettings: {
    maxHistory: number;
    memoryType: "sliding" | "summarized";
  };
  version: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### Key Components

- **AgentService** - CRUD operations for agents
- **PromptEngine** - Variable substitution and template processing
- **ModelAdapter** - Unified interface across different AI providers
- **VersionManager** - Git-like versioning system
- **TestRunner** - Agent testing and validation

## Success Criteria

- Create new agents in under 5 minutes
- Test agents immediately without deployment
- Version control works like Git
- Seamless switching between model tiers
- 90% of agents use smart defaults
