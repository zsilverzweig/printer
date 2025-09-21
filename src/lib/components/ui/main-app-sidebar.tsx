"use client";

import { useUserRouting } from "@/lib/hooks/use-user-routing";
import { useAuthContext } from "@/lib/providers/auth-provider";
import {
  BarChart3,
  FileText,
  Home,
  Settings,
  Shield,
  Users,
} from "lucide-react";
import { AppSidebar, SidebarSection } from "./app-sidebar";
import { UserProfile } from "./user-profile";

export function MainAppSidebar() {
  const { isAdmin } = useAuthContext();
  const { isOnWaitlist } = useUserRouting();

  // Base navigation items for all authenticated users
  const baseSections: SidebarSection[] = [
    {
      title: "Main",
      items: [
        {
          id: "home",
          title: "Dashboard",
          href: "/home",
          icon: <Home className="h-4 w-4" />,
        },
      ],
    },
    {
      title: "Research",
      items: [
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
          id: "user-management",
          title: "User Management",
          href: "/admin/users",
          icon: <Users className="h-4 w-4" />,
          disabled: true,
        },
        {
          id: "admin-settings",
          title: "Admin Settings",
          href: "/admin/settings",
          icon: <Settings className="h-4 w-4" />,
          disabled: true,
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
      sections={allSections}
      footer={<UserProfile />}
    />
  );
}

