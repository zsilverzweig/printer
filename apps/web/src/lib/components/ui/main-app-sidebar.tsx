"use client";

import {
  BarChart3,
  Briefcase,
  Building2,
  Newspaper,
  PlaySquare,
  Shield,
  Table,
  Target,
  TrendingUp,
  Upload,
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
        {
          id: "performance",
          title: "Performance",
          href: "/performance",
          icon: <BarChart3 className="h-4 w-4" />,
        },
      ],
    },
    {
      title: "Research",
      items: [
        {
          id: "ticker",
          title: "Ticker Research",
          href: "/ticker",
          icon: <BarChart3 className="h-4 w-4" />,
        },
        {
          id: "company-research",
          title: "Company Research",
          href: "/company-research",
          icon: <Building2 className="h-4 w-4" />,
        },
        {
          id: "backtests",
          title: "Backtests",
          href: "/research/backtests",
          icon: <PlaySquare className="h-4 w-4" />,
        },
        {
          id: "news",
          title: "News",
          href: "/news",
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
          id: "data-loading",
          title: "Data Loading",
          href: "/admin/assets",
          icon: <Upload className="h-4 w-4" />,
        },
        {
          id: "database",
          title: "Database",
          href: "/admin/database",
          icon: <Table className="h-4 w-4" />,
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
