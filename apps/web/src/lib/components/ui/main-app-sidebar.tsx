"use client";

import {
  Bot,
  Briefcase,
  Building2,
  Database,
  Home,
  Newspaper,
  Settings,
  Shield,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";

import {
  getColorClasses,
  getIconByName,
} from "@/features/finance/funds/config/icon-options";
import { useFunds } from "@/features/finance/funds/hooks/use-funds";
import { useUserRouting } from "@/lib/hooks/use-user-routing";
import { useAuthContext } from "@/lib/providers/auth-provider";

import { AppSidebar, SidebarSection } from "./app-sidebar";
import { UserProfile } from "./user-profile";

export function MainAppSidebar() {
  const { isAdmin } = useAuthContext();
  const { isOnWaitlist } = useUserRouting();
  const { funds, loading: fundsLoading } = useFunds();

  // Base navigation items for all authenticated users
  const baseSections: SidebarSection[] = [
    {
      title: "TCC",
      items: [
        {
          id: "home",
          title: "TCC",
          href: "/",
          icon: <Home className="h-4 w-4" />,
        },
      ],
    },
    {
      title: "Funds",
      titleHref: "/funds",
      items: fundsLoading
        ? []
        : funds.map((fund) => {
            const IconComponent = getIconByName(fund.icon);
            const colorClasses = getColorClasses(fund.iconColor);
            return {
              id: `fund-${fund.id}`,
              title: fund.name,
              href: `/funds/${fund.id}`,
              icon: (
                <IconComponent
                  className={`h-4 w-4 ${colorClasses.textClass}`}
                />
              ),
            };
          }),
    },
    {
      title: "Investment",
      items: [
        {
          id: "portfolios",
          title: "Portfolios",
          href: "/portfolios",
          icon: <Briefcase className="h-4 w-4" />,
        },
        {
          id: "trading",
          title: "Trading",
          href: "/trading",
          icon: <TrendingUp className="h-4 w-4" />,
        },
        {
          id: "screener",
          title: "Screener",
          href: "/screener",
          icon: <Target className="h-4 w-4" />,
        },
      ],
    },
    {
      title: "Research",
      items: [
        {
          id: "company-research",
          title: "Company Research",
          href: "/company-research",
          icon: <Building2 className="h-4 w-4" />,
        },
        {
          id: "events",
          title: "Events",
          href: "/events",
          icon: <Database className="h-4 w-4" />,
        },
        {
          id: "news-test",
          title: "News",
          href: "/news-test",
          icon: <Newspaper className="h-4 w-4" />,
        },
      ],
    },
  ];

  // Admin-specific sections
  const adminSections: SidebarSection[] = [
    {
      title: "Administration",
      items: [
        {
          id: "admin-dashboard",
          title: "Admin Panel",
          href: "/admin",
          icon: <Shield className="h-4 w-4" />,
        },
        {
          id: "ticker-database",
          title: "Ticker Database",
          href: "/admin/assets",
          icon: <Database className="h-4 w-4" />,
        },
        {
          id: "database-admin",
          title: "Database Admin",
          href: "/admin/database",
          icon: <Database className="h-4 w-4" />,
        },
        {
          id: "agent-management",
          title: "Agent Management",
          href: "/admin/agents",
          icon: <Bot className="h-4 w-4" />,
        },
        {
          id: "admin-settings",
          title: "Admin Settings",
          href: "/admin/settings",
          icon: <Settings className="h-4 w-4" />,
        },
      ],
    },
  ];

  // Waitlist-specific sections
  const waitlistSections: SidebarSection[] = [
    {
      title: "Waitlist",
      items: [
        {
          id: "waitlist-dashboard",
          title: "Waitlist Dashboard",
          href: "/waitlist",
          icon: <Users className="h-4 w-4" />,
        },
      ],
    },
  ];

  // Combine sections based on user role
  const allSections = [
    ...baseSections,
    ...(isAdmin ? adminSections : []),
    ...(isOnWaitlist && !isAdmin ? waitlistSections : []),
  ];

  return (
    <AppSidebar
      title="Printer"
      sections={[
        ...allSections,
        {
          title: "",
          items: [
            {
              id: "pura-vida",
              title: "Pura Vida",
              href: "/#pura-vida",
              className:
                "text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/30",
            },
          ],
        },
      ]}
      footer={<UserProfile />}
    />
  );
}
