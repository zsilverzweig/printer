import { MarkdownViewer } from "@/features/welcome-page/components/markdown-viewer";
import { getMarkdownFile } from "@/lib/services/markdown";
import { notFound } from "next/navigation";

/**
 * Welcome page component that shows the main documentation
 * This is a server component that can use the markdown service
 * Sidebar is now handled at the layout level
 */
export async function WelcomePage() {
  // Default to showing the Fund Prospectus README
  const defaultSlug = "Fund Prospectus/README";
  const markdownFile = await getMarkdownFile(defaultSlug);

  if (!markdownFile) {
    notFound();
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <MarkdownViewer file={markdownFile} />
    </div>
  );
}
