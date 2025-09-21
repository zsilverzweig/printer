"use client";

import { MarkdownFile } from "@/lib/services/markdown";
import { FileText, Home, Loader2, Printer } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AppSidebar, SidebarSection } from "./app-sidebar";
import { UserProfile } from "./user-profile";

export function WelcomeSidebar() {
  const pathname = usePathname();
  const [files, setFiles] = useState<MarkdownFile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadMarkdownFiles = async () => {
      try {
        const response = await fetch("/api/markdown");
        if (response.ok) {
          const markdownFiles = await response.json();
          setFiles(markdownFiles);
        } else {
          console.error("Failed to fetch markdown files:", response.statusText);
        }
      } catch (error) {
        console.error("Failed to load markdown files:", error);
      } finally {
        setLoading(false);
      }
    };

    loadMarkdownFiles();
  }, []);

  if (loading) {
    return (
      <div className="w-80 border-r bg-card p-6">
        <div className="flex items-center mb-4">
          <Printer className="h-6 w-6 text-primary" />
          <h2 className="text-lg font-semibold ml-2">Printer</h2>
        </div>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }
  // Get current slug from pathname
  const currentSlug =
    pathname === "/" ? "README" : decodeURIComponent(pathname.substring(1));

  // Filter out README and organize files by category
  const filteredFiles = files.filter((file) => file.slug !== "README");

  // Separate files into categories
  const mainDocs = filteredFiles.filter((file) => !file.slug.includes("/"));
  const devPlanningFiles = filteredFiles.filter((file) =>
    file.slug.startsWith("Development Planning/")
  );
  const fundProspectusFiles = filteredFiles.filter((file) =>
    file.slug.startsWith("Fund Prospectus/")
  );

  // Build sections dynamically
  const sections: SidebarSection[] = [];

  // Home section
  sections.push({
    title: "Main",
    items: [
      {
        id: "home",
        title: "Home",
        href: "/",
        icon: <Home className="h-4 w-4" />,
        isActive: currentSlug === "README",
      },
    ],
  });

  // Documentation section
  if (mainDocs.length > 0) {
    sections.push({
      title: "Documentation",
      items: mainDocs.map((file) => ({
        id: file.slug,
        title: file.title,
        href: `/${encodeURIComponent(file.slug)}`,
        icon: <FileText className="h-4 w-4" />,
        isActive: currentSlug === file.slug,
      })),
    });
  }

  // Development Planning section
  if (devPlanningFiles.length > 0) {
    sections.push({
      title: "Development Planning",
      items: devPlanningFiles.map((file) => ({
        id: file.slug,
        title: file.title,
        href: `/${encodeURIComponent(file.slug)}`,
        icon: <FileText className="h-4 w-4" />,
        isActive: currentSlug === file.slug,
      })),
    });
  }

  // Fund Prospectus section
  if (fundProspectusFiles.length > 0) {
    sections.push({
      title: "Fund Prospectus",
      items: fundProspectusFiles.map((file) => ({
        id: file.slug,
        title: file.title,
        href: `/${encodeURIComponent(file.slug)}`,
        icon: <FileText className="h-4 w-4" />,
        isActive: currentSlug === file.slug,
      })),
    });
  }

  return (
    <AppSidebar
      title="Printer"
      logo={<Printer className="h-6 w-6 text-primary" />}
      sections={sections}
      footer={<UserProfile />}
    />
  );
}
