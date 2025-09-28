// Refine Investment Thesis work implementation
import { log } from "@/lib/utils/logger";

import { Work, WorkContext } from "../../../lib/types/work";
import { 
  RefineThesisInput, 
  RefineThesisOutput,
  WORK_TYPES 
} from "../types/work-types";

const REFINE_THESIS_SCHEMA = {
  type: "object",
  required: ["thesis"],
  properties: {
    thesis: { type: "string", minLength: 10 }
  }
};

const REFINE_THESIS_OUTPUT_SCHEMA = {
  type: "object",
  required: ["refined_thesis", "rationale"],
  properties: {
    refined_thesis: { type: "string" },
    rationale: { type: "string" }
  }
};

const PROMPT_TEMPLATE = `You are an expert investment thesis analyst. Your role is to refine and improve investment theses to make them more compelling, clear, and actionable.

Your task is to:
1. Analyze the provided investment thesis
2. Identify areas for improvement (clarity, specificity, risk assessment, etc.)
3. Provide a refined version that is more compelling and actionable
4. Explain your rationale for the changes

Original Investment Thesis: {{thesis}}

Please respond with a JSON object containing:
- refined_thesis: The improved version of the thesis
- rationale: Your explanation of what was improved and why`;

export const refineThesisWork: Work<RefineThesisInput, RefineThesisOutput> = {
  type: WORK_TYPES.REFINE_THESIS,
  name: "Refine Investment Thesis",
  description: "Improves and refines investment theses for clarity and actionability",
  inputSchema: REFINE_THESIS_SCHEMA,
  outputSchema: REFINE_THESIS_OUTPUT_SCHEMA,
  
  async execute(input: RefineThesisInput, context: WorkContext): Promise<RefineThesisOutput> {
    log.info("Executing refine thesis work", {
      workType: WORK_TYPES.REFINE_THESIS,
      userId: context.userId,
      agentId: context.agentId,
      thesisLength: input.thesis.length
    }, "RefineThesisWork");

    try {
      // TODO: Implement actual AI execution
      // This would call the AI service with the prompt template and input
      // For now, return a mock response
      const mockOutput: RefineThesisOutput = {
        refined_thesis: `Refined: ${input.thesis}`,
        rationale: "Mock rationale for thesis improvements"
      };

      log.success("Refine thesis work completed", {
        workType: WORK_TYPES.REFINE_THESIS,
        originalLength: input.thesis.length,
        refinedLength: mockOutput.refined_thesis.length
      }, "RefineThesisWork");

      return mockOutput;
    } catch (error) {
      log.error("Refine thesis work failed", error, "RefineThesisWork");
      throw error;
    }
  }
};
