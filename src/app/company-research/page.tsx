import { CompanyResearchManagementWithProvider } from "@/features/research/company/components/company-research-management-with-provider";
import { CompanyResearchProvider } from "@/features/research/company/providers";
import { requireAppAccess } from "@/lib/auth/server";

/**
 * Company Research Page with Real-time Updates
 * 
 * PURPOSE: Allows users to research companies using AI agents and view research history with live updates.
 * 
 * FEATURES:
 * - Search companies by ticker symbol
 * - Assign AI agents to conduct research
 * - View generated research reports
 * - Browse research history with vector search capabilities
 * - Context-aware research logging
 * - Real-time updates of research progress via Firestore listeners
 * - Live status updates (pending → in_progress → completed/failed)
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
          <span className="block mt-1 text-sm text-blue-600">
            ✨ Live updates - watch your research progress in real-time!
          </span>
        </p>
      </div>

      {/* Wrap with provider for real-time updates */}
      <CompanyResearchProvider userId={user.uid}>
        <CompanyResearchManagementWithProvider />
      </CompanyResearchProvider>
    </div>
  );
}
