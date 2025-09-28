"use client";

import { useMemo } from "react";
import { remark } from "remark";
import remarkBreaks from "remark-breaks";
import gfm from "remark-gfm";
import html from "remark-html";

interface MarkdownResearchViewerProps {
  content: string;
}

export function MarkdownResearchViewer({ content }: MarkdownResearchViewerProps) {
  const htmlContent = useMemo(() => {
    if (!content) return "";
    
    try {
      // Process markdown to HTML using the same pipeline as the docs
      const processedContent = remark()
        .use(gfm) // GitHub Flavored Markdown
        .use(remarkBreaks) // Support line breaks
        .use(html, { sanitize: false }) // Convert to HTML
        .processSync(content);

      return processedContent.toString();
    } catch (error) {
      console.error("Error processing markdown:", error);
      // Fallback to plain text if markdown processing fails
      return content.replace(/\n/g, '<br>');
    }
  }, [content]);

  return (
    <div className="markdown-content prose prose-sm max-w-none">
      <div 
        dangerouslySetInnerHTML={{ __html: htmlContent }}
      />
    </div>
  );
}
