// Core work system types for agents
import { JSONSchema7 } from "json-schema";

export interface WorkContext {
  userId: string;
  agentId: string;
  metadata?: Record<string, unknown>;
}

export interface Work<TInput, TOutput> {
  type: string;
  name: string;
  description: string;
  inputSchema: JSONSchema7;
  outputSchema: JSONSchema7;
  execute: (input: TInput, context: WorkContext) => Promise<TOutput>;
}

