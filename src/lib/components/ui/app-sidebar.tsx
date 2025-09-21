"use client";

import { Button } from "@/lib/components/ui/button";
import { Separator } from "@/lib/components/ui/separator";
import { cn } from "@/lib/utils/utils";
import { Printer } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

export interface SidebarItem {
  id: string;
  title: string;
  href: string;
  icon?: ReactNode;
  isActive?: boolean;
  disabled?: boolean;
}

export interface SidebarSection {
  title: string;
  items: SidebarItem[];
}

interface AppSidebarProps {
  title?: string;
  logo?: ReactNode;
  sections?: SidebarSection[];
  footer?: ReactNode;
  className?: string;
  width?: string;
}

export function AppSidebar({
  title = "Printer",
  logo = <Printer className="h-6 w-6 text-primary" />,
  sections = [],
  footer,
  className,
  width = "w-80",
}: AppSidebarProps) {
  const pathname = usePathname();

  return (
    <div className={cn(width, "border-r bg-card", className)}>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center mb-4">
          {logo}
          <h2 className="text-lg font-semibold ml-2">{title}</h2>
        </div>

        {/* Navigation */}
        <nav className="space-y-4">
          {sections.map((section, sectionIndex) => (
            <div key={section.title}>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                {section.title}
              </h3>
              <div className="space-y-1">
                {section.items.map((item) => (
                  item.disabled ? (
                    <Button
                      key={item.id}
                      variant="ghost"
                      className="w-full justify-start opacity-50 cursor-not-allowed"
                      disabled
                    >
                      {item.icon && <span className="mr-2">{item.icon}</span>}
                      {item.title}
                    </Button>
                  ) : (
                    <Link key={item.id} href={item.href}>
                      <Button
                        variant={
                          item.isActive ||
                          pathname === item.href ||
                          pathname.startsWith(item.href + "/")
                            ? "default"
                            : "ghost"
                        }
                        className="w-full justify-start"
                      >
                        {item.icon && <span className="mr-2">{item.icon}</span>}
                        {item.title}
                      </Button>
                    </Link>
                  )
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        {footer && (
          <>
            <Separator className="my-6" />
            <div className="mt-auto">{footer}</div>
          </>
        )}
      </div>
    </div>
  );
}

