import { notFound } from "next/navigation";

import { MarkdownViewer } from "@/features/welcome-page/components/markdown-viewer";
import { getMarkdownFile } from "@/lib/services/markdown";

/**
 * Welcome page component that shows the main documentation
 * This is a server component that can use the markdown service
 * Sidebar is now handled at the layout level
 */
export async function WelcomePage() {
  console.log("[PERF] WelcomePage starting at:", new Date().toISOString());

  // Default to showing the Fund Prospectus README
  const defaultSlug = "Fund Prospectus/README";

  const startTime = performance.now();
  const markdownFile = await getMarkdownFile(defaultSlug);
  const endTime = performance.now();

  console.log("[PERF] getMarkdownFile took:", endTime - startTime, "ms");

  if (!markdownFile) {
    notFound();
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <MarkdownViewer file={markdownFile} />
    </div>
  );
}
