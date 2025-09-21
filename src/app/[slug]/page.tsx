import { MarkdownViewer } from "@/features/welcome-page/components/markdown-viewer";
import { getMarkdownFile, getMarkdownFiles } from "@/lib/services/markdown";
import { notFound } from "next/navigation";

interface PageProps {
  params: {
    slug: string;
  };
}

export default async function MarkdownPage({ params }: PageProps) {
  // Decode the URL-encoded slug
  const decodedSlug = decodeURIComponent(params.slug);
  const markdownFile = await getMarkdownFile(decodedSlug);

  if (!markdownFile) {
    notFound();
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <MarkdownViewer file={markdownFile} />
    </div>
  );
}

export async function generateStaticParams() {
  const files = await getMarkdownFiles();
  return files.map((file) => ({
    slug: file.slug,
  }));
}
