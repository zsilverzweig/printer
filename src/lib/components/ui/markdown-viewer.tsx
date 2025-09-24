"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Card } from "@/lib/components/ui/card";
import { MarkdownFile } from "@/lib/services/markdown";

import { H2Navigation } from "./h2-navigation";

interface MarkdownViewerProps {
  file: MarkdownFile;
}

export function MarkdownViewer({ file }: MarkdownViewerProps) {
  const router = useRouter();

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const link = target.closest("a");

      if (!link || !link.href) {
        return;
      }

      const url = new URL(link.href);

      if (url.pathname.startsWith("/") && url.pathname !== window.location.pathname) {
        event.preventDefault();
        router.push(url.pathname);
      }
    };

    document.addEventListener("click", handleClick);

    return () => document.removeEventListener("click", handleClick);
  }, [router]);

  return (
    <div>
      <H2Navigation />
      <Card className="p-8">
        <div className="markdown-content">
          <div dangerouslySetInnerHTML={{ __html: file.html }} />
        </div>
      </Card>
    </div>
  );
}
