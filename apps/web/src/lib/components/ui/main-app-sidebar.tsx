"use client";

import {
  BarChart3,
  Bot,
  Briefcase,
  Building2,
  Database,
  FileText,
  Home,
  Layers,
  Newspaper,
  Settings,
  Shield,
  Target,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";

import { useUserRouting } from "@/lib/hooks/use-user-routing";
import { useAuthContext } from "@/lib/providers/auth-provider";

import { AppSidebar, SidebarSection } from "./app-sidebar";
import { UserProfile } from "./user-profile";

export function MainAppSidebar() {
  const { isAdmin } = useAuthContext();
  const { isOnWaitlist } = useUserRouting();

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
        {
          id: "funds",
          title: "Funds",
          href: "/funds",
          icon: <Wallet className="h-4 w-4" />,
        },
        {
          id: "strategies",
          title: "Strategies",
          href: "/funds",
          icon: <Layers className="h-4 w-4" />,
        },
      ],
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
          id: "stock-chart",
          title: "Stock Chart",
          href: "/stocks/AAPL",
          icon: <BarChart3 className="h-4 w-4" />,
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
        {
          id: "analysis",
          title: "Analysis",
          href: "/analysis",
          icon: <BarChart3 className="h-4 w-4" />,
          disabled: true,
        },
        {
          id: "reports",
          title: "Reports",
          href: "/reports",
          icon: <FileText className="h-4 w-4" />,
          disabled: true,
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
