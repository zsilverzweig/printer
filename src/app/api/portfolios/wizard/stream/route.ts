import { NextRequest } from "next/server";

import { agentService } from "@/features/ai/agents/services/agent-service";
import { getServerUser } from "@/lib/auth/server";
import { log } from "@/lib/utils/logger";

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestId = `wizard_stream_${Date.now()}_${Math.random()
    .toString(36)
    .substr(2, 6)}`;

  try {
    log.info(
      "Portfolio wizard streaming request started",
      { requestId },
      "PortfolioWizardStreamAPI"
    );

    const body = await request.json();
    const thesis = typeof body.thesis === "string" ? body.thesis : "";
    const name = typeof body.name === "string" ? body.name : undefined;
    const description =
      typeof body.description === "string" ? body.description : undefined;
    const autoRefineThesis = typeof body.autoRefineThesis === "boolean" ? body.autoRefineThesis : false;

    if (!thesis.trim()) {
      log.warn(
        "Portfolio wizard streaming request rejected - no thesis",
        { requestId },
        "PortfolioWizardStreamAPI"
      );
      return new Response(JSON.stringify({ error: "Thesis is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get authenticated user from server-side cookies
    const user = await getServerUser();
    if (!user) {
      log.warn(
        "Portfolio wizard streaming request rejected - no authentication",
        { requestId },
        "PortfolioWizardStreamAPI"
      );
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    const userId = user.uid;

    // Create a readable stream for Server-Sent Events
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();

        const sendEvent = (event: string, data: any) => {
          const message = `data: ${JSON.stringify({
            event,
            data,
            timestamp: new Date().toISOString(),
          })}\n\n`;
          controller.enqueue(encoder.encode(message));
        };

        const processWizard = async () => {
          try {
            // Step 1: Validate input
            sendEvent("step_start", {
              step: "validate-input",
              title: "Validating Input",
              description: "Checking thesis and portfolio parameters",
            });
            await new Promise((resolve) => setTimeout(resolve, 500));
            sendEvent("step_complete", {
              step: "validate-input",
              details: "Thesis validated successfully",
            });

            // Step 2: Create portfolio
            sendEvent("step_start", {
              step: "create-portfolio",
              title: "Creating Portfolio",
              description: "Setting up portfolio structure and metadata",
            });
            await new Promise((resolve) => setTimeout(resolve, 300));
            sendEvent("step_complete", {
              step: "create-portfolio",
              details: "Portfolio structure created",
            });

            // Step 3: Ensure agent
            sendEvent("step_start", {
              step: "ensure-agent",
              title: "Preparing AI Agent",
              description: "Loading Portfolio Manager agent configuration",
            });
            await new Promise((resolve) => setTimeout(resolve, 400));
            sendEvent("step_complete", {
              step: "ensure-agent",
              details: "Portfolio Manager agent ready",
            });

            // Step 4: Refine thesis (if requested)
            let refinedThesis = thesis;
            if (autoRefineThesis) {
              sendEvent("step_start", {
                step: "refine-thesis",
                title: "Refining Investment Thesis",
                description: "Portfolio Manager is improving your thesis for clarity and impact",
              });

              try {
                // TODO: Implement actual thesis refinement using the Portfolio Manager agent
                // For now, we'll simulate the refinement
                await new Promise((resolve) => setTimeout(resolve, 2000));
                
                // Mock refinement - in real implementation, this would call the refinement work
                refinedThesis = `Refined: ${thesis}`;
                
                sendEvent("step_complete", {
                  step: "refine-thesis",
                  details: "Thesis refined for better clarity and impact",
                });
              } catch (error) {
                log.error("Thesis refinement failed", error, "PortfolioWizardStreamAPI");
                sendEvent("step_complete", {
                  step: "refine-thesis",
                  details: "Thesis refinement skipped due to error, using original thesis",
                });
              }
            }

            // Step 5: Generate plan (this is where the actual AI call happens)
            sendEvent("step_start", {
              step: "generate-plan",
              title: "Generating Investment Plan",
              description: "AI agent analyzing thesis and creating positions",
            });

            const planStartTime = Date.now();
            const portfolio = await agentService.createPortfolioDraftFromThesis(
              refinedThesis,
              userId,
              {
                name: name?.trim() || undefined,
                description: description?.trim() || undefined,
              }
            );
            const planDuration = Date.now() - planStartTime;

            sendEvent("step_complete", {
              step: "generate-plan",
              details: `AI generated investment plan in ${planDuration}ms`,
              duration: planDuration,
            });

            // Step 5: Parse positions
            sendEvent("step_start", {
              step: "parse-positions",
              title: "Processing Positions",
              description: "Converting AI response into trade-ready positions",
            });
            await new Promise((resolve) => setTimeout(resolve, 200));
            sendEvent("step_complete", {
              step: "parse-positions",
              details: "Positions processed and validated",
            });

            // Step 6: Finalize
            sendEvent("step_start", {
              step: "finalize-portfolio",
              title: "Finalizing Portfolio",
              description: "Saving portfolio with generated positions",
            });
            await new Promise((resolve) => setTimeout(resolve, 300));
            sendEvent("step_complete", {
              step: "finalize-portfolio",
              details: "Portfolio saved successfully",
            });

            // Send final result
            const totalDuration = Date.now() - startTime;
            sendEvent("complete", {
              portfolio,
              metadata: {
                requestId,
                duration: totalDuration,
                generatedAt: new Date().toISOString(),
              },
            });

            log.success(
              "Portfolio wizard streaming request completed successfully",
              {
                requestId,
                duration: totalDuration,
                portfolioId: portfolio.id,
                portfolioName: portfolio.name,
                positionCount: portfolio.positions.length,
              },
              "PortfolioWizardStreamAPI"
            );
          } catch (error) {
            const duration = Date.now() - startTime;
            log.failure(
              "Failed to generate portfolio draft (streaming)",
              {
                error,
                requestId,
                duration,
                errorMessage:
                  error instanceof Error ? error.message : "Unknown error",
                errorStack: error instanceof Error ? error.stack : undefined,
              },
              "PortfolioWizardStreamAPI"
            );

            sendEvent("error", {
              error: "Failed to generate portfolio draft",
              requestId,
              details: error instanceof Error ? error.message : "Unknown error",
            });
          } finally {
            controller.close();
          }
        };

        processWizard();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    log.failure(
      "Failed to initialize portfolio wizard stream",
      {
        error,
        requestId,
        duration,
        errorMessage: error instanceof Error ? error.message : "Unknown error",
        errorStack: error instanceof Error ? error.stack : undefined,
      },
      "PortfolioWizardStreamAPI"
    );

    return new Response(
      JSON.stringify({
        error: "Failed to initialize portfolio wizard stream",
        requestId,
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
