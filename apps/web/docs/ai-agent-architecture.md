# AI Agent Architecture

## Core Principles

### 1. **Server-Side AI Execution Only**
- AI services (`AIService`, OpenAI calls) **NEVER** run on client-side
- All AI calls go through API routes where `process.env.OPENAI_API_KEY` is available
- Client-side code only orchestrates the flow, never executes AI directly

### 2. **Consistent Agent Pattern**
Every AI agent follows this exact structure:

```
Agent Class (Client-side)
├── Core Identity: "I am the [Agent Name], I [purpose]"
├── Work Types: Array of work capabilities
└── Execute methods that call API routes

API Route (Server-side)
├── Authentication: getServerUser()
├── Input validation
├── AgentService call
└── Response with structured output

AgentService Method (Server-side)
├── Create AIAgent with defaults
├── Call AIService.generateResponse()
├── Parse and validate output
└── Return typed result
```

### 3. **Security Layers**
- **Authentication**: `getServerUser()` on all API routes
- **Rate Limiting**: Built into `AIService` and `SecurityWrapper`
- **Cost Monitoring**: Tracks AI spending per user/operation
- **Input Validation**: Schema validation on all inputs
- **Audit Trail**: All AI calls logged with user context

## Implementation Pattern

### Agent Class (Client-side)
```typescript
export class [AgentName]Agent {
  private agent: BaseAgent;

  constructor() {
    this.agent = this.createAgent();
  }

  private createAgent(): BaseAgent {
    return {
      id: "[agent-name]-agent",
      name: "[Agent Name]",
      description: "I am the [Agent Name], I [purpose]",
      model: {
        name: "gpt-4o-mini",
        provider: "openai",
        // ... other model config
      },
      temperature: 0.2,
      maxTokens: 2000,
      work: [work1, work2], // Work types this agent can do
      version: "1.0.0",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: "system",
    };
  }

  async [workMethod](input: InputType, userId: string): Promise<OutputType> {
    // Call API route - NEVER call AI directly
    const response = await fetch('/api/agents/[work-endpoint]', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    
    if (!response.ok) throw new Error('Work failed');
    return response.json();
  }

  getAgent(): BaseAgent { return this.agent; }
  getWorkTypes(): string[] { return this.agent.work.map(w => w.type); }
}
```

### API Route (Server-side)
```typescript
// /api/agents/[work-endpoint]/route.ts
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { input } = body;

    // Authentication
    const user = await getServerUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    // Input validation
    if (!input || !isValidInput(input)) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    // Execute work through AgentService
    const result = await agentService.[workMethod](input, user.uid);
    
    return NextResponse.json(result);
  } catch (error) {
    log.error("Work failed", error, "WorkAPI");
    return NextResponse.json({ error: "Work failed" }, { status: 500 });
  }
}
```

### AgentService Method (Server-side)
```typescript
// In AgentService
async [workMethod](input: InputType, userId: string): Promise<OutputType> {
  const agent = await this.[agentName]Agent.ensureAgent();
  
  log.info("Starting work", { userId, agentId: agent.id }, "AgentService");

  // Import work directly to execute on server
  const { [workName]Work } = await import("../../agents/[agent]/work/[work]");
  
  const context = {
    userId,
    agentId: agent.id,
    metadata: { workType: "[work_type]" }
  };

  const result = await [workName]Work.execute(input, context);
  
  log.success("Work completed", { userId }, "AgentService");
  return result;
}
```

### Work Implementation (Server-side)
```typescript
// Work executes on server with access to AIService
export const [workName]Work: Work<InputType, OutputType> = {
  type: "[WORK_TYPE]",
  name: "[Work Name]",
  description: "What this work does",
  inputSchema: INPUT_SCHEMA,
  outputSchema: OUTPUT_SCHEMA,
  
  async execute(input: InputType, context: WorkContext): Promise<OutputType> {
    const aiService = new AIService();
    
    // Get the agent configuration from the agent service
    const agentConfig = await agentService.getAgent(context.agentId);
    if (!agentConfig) throw new Error(`Agent ${context.agentId} not found`);
    
    // Convert BaseAgent to AIAgent for AIService
    const agent: AIAgent = {
      id: agentConfig.id,
      name: agentConfig.name,
      description: agentConfig.description,
      role: agentConfig.role,
      model: agentConfig.model,
      temperature: agentConfig.temperature,
      maxTokens: agentConfig.maxTokens,
      systemPrompt: CORE_IDENTITY, // From work file
      version: agentConfig.version,
      createdAt: agentConfig.createdAt,
      updatedAt: agentConfig.updatedAt,
      isActive: agentConfig.isActive,
    };
    
    // Create request with work prompt + user input
    const request: AIRequest = {
      id: `[work-name]-${Date.now()}`,
      agentId: context.agentId,
      prompt: `${WORK_PROMPT}\n\nHere's what the user provided: ${input.userInput}`,
      timestamp: new Date(),
      userId: context.userId,
    };
    
    // Execute AI call
    const response = await aiService.generateResponse(agent, request, "[operation]");
    
    // Parse JSON response
    const result = JSON.parse(response.content) as OutputType;
    return result;
  }
};
```

## What NOT to Do

❌ **Never import `AIService` or `AI_MODELS` on client-side**
❌ **Never instantiate OpenAI client on client-side**
❌ **Never skip authentication on API routes**
❌ **Never bypass input validation**
❌ **Never call AI services directly from hooks**

## Migration Strategy

1. **Audit existing agents** - Find all client-side AI imports
2. **Create proper API routes** - One per work type
3. **Update agent classes** - Remove AI imports, add API calls
4. **Test security layers** - Authentication, rate limiting, cost monitoring
5. **Remove dead code** - Clean up unused imports and methods

## File Structure

```
src/
├── features/agents/
│   ├── agents/
│   │   └── [agent-name]/
│   │       ├── [agent-name]-agent.ts          # Client-side agent class
│   │       ├── types/work-types.ts            # Input/output types
│   │       └── work/
│   │           └── [work-name].ts             # Server-side work implementation
│   └── hooks/
│       └── use-[agent-name].ts                # Client-side hook
├── app/api/agents/
│   └── [work-endpoint]/
│       └── route.ts                           # API route
└── features/ai/agents/services/
    └── agent-service.ts                       # Server-side orchestration
```

This architecture ensures:
- ✅ Security (auth, rate limiting, cost monitoring)
- ✅ Consistency (same pattern for all agents)
- ✅ Maintainability (clear separation of concerns)
- ✅ Scalability (easy to add new agents/work types)
