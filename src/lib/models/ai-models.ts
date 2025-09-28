// ============================================================================
// AI MODELS CONFIGURATION
// ============================================================================

export const AI_MODELS = {
  // Premium models - best quality, higher cost
  premium: {
    name: "gpt-4o",
    provider: "openai" as const,
    maxTokens: 128000,
    costPerInputToken: 2.5 / 1000000,
    costPerOutputToken: 10.0 / 1000000,
    capabilities: ["text", "vision", "function_calling"],
    contextWindow: 128000,
  },
  
  // Balanced model - good quality, reasonable cost
  balanced: {
    name: "gpt-4o-mini",
    provider: "openai" as const,
    maxTokens: 128000,
    costPerInputToken: 0.15 / 1000000,
    costPerOutputToken: 0.6 / 1000000,
    capabilities: ["text", "function_calling"],
    contextWindow: 128000,
  },
  
  // Fast model - quick responses, higher cost
  fast: {
    name: "gpt-4-turbo",
    provider: "openai" as const,
    maxTokens: 4096,
    costPerInputToken: 10.0 / 1000000,
    costPerOutputToken: 30.0 / 1000000,
    capabilities: ["text", "function_calling"],
    contextWindow: 128000,
  },
  
  // Cheap model - economical, basic quality
  cheap: {
    name: "gpt-3.5-turbo",
    provider: "openai" as const,
    maxTokens: 4096,
    costPerInputToken: 0.5 / 1000000,
    costPerOutputToken: 1.5 / 1000000,
    capabilities: ["text", "function_calling"],
    contextWindow: 16385,
  },
} as const;
