import { CompanyResearchTest } from "@/features/research/company/components/company-research-test";

/**
 * Test page for company research functionality
 * This page demonstrates the structured JSON research API
 */
export default function TestResearchPage() {
  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Company Research Test</h1>
        <p className="text-muted-foreground mt-2">
          Test the structured JSON research API with different companies.
        </p>
      </div>

      <CompanyResearchTest />
    </div>
  );
}
