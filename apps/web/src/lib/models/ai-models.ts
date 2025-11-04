// ============================================================================
// AI MODELS CONFIGURATION
// ============================================================================

export const AI_MODELS = {
  // Premium models - best quality, higher cost
  premium: {
    name: "gpt-4o",
    provider: "openai" as const,
    maxTokens: 4096,
    costPerInputToken: 2.5 / 1000000,
    costPerOutputToken: 10.0 / 1000000,
    capabilities: ["text", "vision", "function_calling"],
    contextWindow: 128000,
    temperature: 0.2,
  },

  // Balanced model - good quality, reasonable cost
  balanced: {
    name: "gpt-4o-mini",
    provider: "openai" as const,
    maxTokens: 4096, // Safe limit for gpt-4o-mini completion tokens
    costPerInputToken: 0.15 / 1000000,
    costPerOutputToken: 0.6 / 1000000,
    capabilities: ["text", "function_calling"],
    contextWindow: 128000,
    temperature: 0.2,
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
    temperature: 0.2,
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
    temperature: 0.2,
  },

  // GPT-5 Pro - best quality GPT-5 model
  gpt5Pro: {
    name: "gpt-5-pro",
    provider: "openai" as const,
    maxTokens: 4096,
    costPerInputToken: 5.0 / 1000000,
    costPerOutputToken: 15.0 / 1000000,
    capabilities: ["text", "function_calling", "structured_outputs"],
    contextWindow: 128000,
    temperature: 0.2,
  },

  // GPT-5 Nano - economical GPT-5 model
  gpt5Nano: {
    name: "gpt-5-nano",
    provider: "openai" as const,
    maxTokens: 4096,
    costPerInputToken: 0.25 / 1000000,
    costPerOutputToken: 0.75 / 1000000,
    capabilities: ["text", "function_calling", "structured_outputs"],
    contextWindow: 128000,
    temperature: 0.2,
  },
} as const;
