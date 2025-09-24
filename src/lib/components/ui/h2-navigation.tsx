"use client";

import { useEffect, useState } from "react";

import { Button } from "@/lib/components/ui/button";
import { log } from "@/lib/utils/logger";
import { cn } from "@/lib/utils/utils";

interface H2NavigationProps {
  className?: string;
}

interface HeadingSection {
  id: string;
  text: string;
}

export function H2Navigation({ className }: H2NavigationProps) {
  const [sections, setSections] = useState<HeadingSection[]>([]);
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    const headingElements = document.querySelectorAll(".markdown-content h2");
    log.debug(
      "H2Navigation useEffect triggered",
      { count: headingElements.length },
      "H2Navigation",
    );

    const parsedHeadings = Array.from(headingElements).map((heading) => {
      const id =
        heading.textContent
          ?.toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || "";

      heading.id = id;
      log.debug(
        "H2 element processed",
        { text: heading.textContent, id },
        "H2Navigation",
      );

      return { id, text: heading.textContent || "" };
    });

    log.debug("Processed H2 elements", { elements: parsedHeadings }, "H2Navigation");
    setSections(parsedHeadings);

    if (parsedHeadings.length > 0) {
      setActiveId(parsedHeadings[0].id);
    }

    const handleScroll = () => {
      const scrollY = window.scrollY + 160;

      for (let index = parsedHeadings.length - 1; index >= 0; index -= 1) {
        const element = document.getElementById(parsedHeadings[index].id);
        if (element && element.offsetTop <= scrollY) {
          setActiveId(parsedHeadings[index].id);
          break;
        }
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  const scrollToSection = (id: string) => {
    log.debug("Scrolling to section", { id }, "H2Navigation");
    const element = document.getElementById(id);
    log.debug("Found element", { element: !!element }, "H2Navigation");

    if (!element) {
      log.error("Element not found for id", { id }, "H2Navigation");
      return;
    }

    setActiveId(id);
    element.style.scrollMarginTop = "160px";

    element.scrollIntoView({
      behavior: "smooth",
      block: "start",
      inline: "nearest",
    });

    window.setTimeout(() => {
      element.style.scrollMarginTop = "";
    }, 1000);
  };

  if (sections.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur-sm",
        className,
      )}
    >
      <div className="container mx-auto px-6 py-3">
        <div className="flex gap-2 overflow-x-auto">
          {sections.map(({ id, text }) => (
            <Button
              key={id}
              variant={activeId === id ? "default" : "ghost"}
              size="sm"
              onClick={() => scrollToSection(id)}
              className={cn(
                "flex-shrink-0 whitespace-nowrap transition-all duration-200",
                activeId === id
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "hover:bg-secondary/20",
              )}
            >
              {text}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
