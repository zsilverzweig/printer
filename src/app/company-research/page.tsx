import { CompanyResearchManagement } from "@/features/research/company/components/company-research-management";
import { requireAppAccess } from "@/lib/auth/server";

/**
 * Company Research Page
 * 
 * PURPOSE: Allows users to research companies using AI agents and view research history.
 * 
 * FEATURES:
 * - Search companies by ticker symbol
 * - Assign AI agents to conduct research
 * - View generated research reports
 * - Browse research history with vector search capabilities
 * - Context-aware research logging
 */
export default async function CompanyResearchPage() {
  // This runs on the server and redirects if user doesn't have access
  const user = await requireAppAccess();

  // If we reach here, user is authenticated and has app access
  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Company Research</h1>
        <p className="text-muted-foreground mt-2">
          Use AI agents to conduct deep research on companies and build your investment knowledge base.
        </p>
      </div>

      {/* Pass user data to client component */}
      <CompanyResearchManagement userId={user.uid} />
    </div>
  );
}
