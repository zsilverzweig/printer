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
  required: ["thesis_title", "thesis_description", "rationale"],
  properties: {
    thesis_title: { type: "string" },
    thesis_description: { type: "string" },
    rationale: { type: "string" }
  }
};

const PROMPT_TEMPLATE = `You are an expert investment thesis analyst. Your role is to refine and improve investment theses to make them more compelling, clear, and actionable.

Your task is to:
1. Analyze the provided investment thesis
2. Create a compelling thesis title that captures the core investment idea
3. Write a refined thesis description that is clear, specific, and actionable
4. Explain your rationale for the improvements

Original Investment Thesis: {{thesis}}

Please respond with a JSON object containing:
- thesis_title: A compelling, concise title for the investment thesis
- thesis_description: A refined, clear, and actionable description of the investment thesis
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
        thesis_title: "Refined Investment Thesis",
        thesis_description: `Refined: ${input.thesis}`,
        rationale: "Mock rationale for thesis improvements"
      };

      log.success("Refine thesis work completed", {
        workType: WORK_TYPES.REFINE_THESIS,
        originalLength: input.thesis.length,
        titleLength: mockOutput.thesis_title.length,
        descriptionLength: mockOutput.thesis_description.length
      }, "RefineThesisWork");

      return mockOutput;
    } catch (error) {
      log.error("Refine thesis work failed", error, "RefineThesisWork");
      throw error;
    }
  }
};
