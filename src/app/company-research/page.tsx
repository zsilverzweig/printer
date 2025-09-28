import { CompanyResearch } from "@/features/research/company/components/company-research";
import { requireAppAccess } from "@/lib/auth/server";

/**
 * Company Research Page
 * 
 * PURPOSE: Allows users to research companies using the Research Analyst AI agent.
 * 
 * FEATURES:
 * - Search companies by ticker symbol
 * - Get comprehensive AI-generated research reports
 * - View executive summary and investment recommendations
 * - Focus research on specific areas
 */
export default async function CompanyResearchPage() {
  // This runs on the server and redirects if user doesn't have access
  const user = await requireAppAccess();

  // If we reach here, user is authenticated and has app access
  return (
    <div className="container mx-auto p-6">
      <CompanyResearch />
    </div>
  );
}
