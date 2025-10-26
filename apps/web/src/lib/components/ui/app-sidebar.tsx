"use client";

import { Printer } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useMemo } from "react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
} from "@/lib/components/ui/sidebar";

export interface SidebarItem {
  id: string;
  title: string;
  href: string;
  icon?: ReactNode;
  isActive?: boolean;
  disabled?: boolean;
  className?: string;
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
  children?: ReactNode;
}

export function AppSidebar({
  title = "Printer",
  logo = <Printer className="h-6 w-6 text-primary" />,
  sections = [],
  footer,
  className,
  children,
}: AppSidebarProps) {
  const pathname = usePathname();

  const isRouteActive = useMemo(() => {
    return (item: SidebarItem) => {
      if (item.isActive) {
        return true;
      }

      if (pathname === item.href) {
        return true;
      }

      if (pathname.startsWith(`${item.href}/`)) {
        const hasMoreSpecificRoute = sections.some((section) =>
          section.items.some((otherItem) => {
            if (otherItem.href === item.href) {
              return false;
            }

            const isChildRoute = otherItem.href.startsWith(`${item.href}/`);

            return isChildRoute && pathname.startsWith(otherItem.href);
          })
        );

        return !hasMoreSpecificRoute;
      }

      return false;
    };
  }, [pathname, sections]);

  return (
    <Sidebar className={className}>
      <SidebarHeader className="border-b border-sidebar-border px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {logo}
            <h2 className="text-lg font-semibold">{title}</h2>
          </div>
          <SidebarTrigger className="h-8 w-8 text-sidebar-foreground" />
        </div>
      </SidebarHeader>
      <SidebarContent className="gap-4 px-2 py-4">
        {children}
        {sections.map((section) => (
          <SidebarGroup key={section.title}>
            <SidebarGroupLabel>{section.title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => {
                  const content = (
                    <>
                      {item.icon}
                      <span className="truncate">{item.title}</span>
                    </>
                  );

                  if (item.disabled) {
                    return (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton
                          disabled
                          className={`cursor-not-allowed opacity-50 ${
                            item.className || ""
                          }`}
                        >
                          {content}
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  }

                  return (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        asChild
                        isActive={isRouteActive(item)}
                        className={item.className}
                      >
                        <Link href={item.href}>{content}</Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      {footer ? (
        <SidebarFooter className="border-t border-sidebar-border px-4 py-3">
          {footer}
        </SidebarFooter>
      ) : null}
      <SidebarRail />
    </Sidebar>
  );
}
