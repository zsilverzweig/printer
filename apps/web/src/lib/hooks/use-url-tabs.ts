/**
 * Hook to sync tab state with URL search parameters
 * This allows tabs to persist through page refreshes
 */

"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

interface UseUrlTabsOptions {
  /** Default tab value if none is specified in URL */
  defaultTab: string;
  /** Query parameter name (defaults to 'tab') */
  paramName?: string;
  /** Whether to replace history instead of pushing (defaults to true) */
  replace?: boolean;
}

/**
 * Manages tab state synchronized with URL search parameters
 *
 * @example
 * const [activeTab, setActiveTab] = useUrlTabs({ defaultTab: 'overview' });
 *
 * return (
 *   <Tabs value={activeTab} onValueChange={setActiveTab}>
 *     <TabsTrigger value="overview">Overview</TabsTrigger>
 *     <TabsTrigger value="details">Details</TabsTrigger>
 *   </Tabs>
 * );
 */
export function useUrlTabs({
  defaultTab,
  paramName = "tab",
  replace = true,
}: UseUrlTabsOptions) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Initialize from URL or use default
  const [activeTab, setActiveTabState] = useState(() => {
    return searchParams.get(paramName) || defaultTab;
  });

  // Sync with URL changes (e.g., browser back/forward)
  useEffect(() => {
    const urlTab = searchParams.get(paramName);
    if (urlTab && urlTab !== activeTab) {
      setActiveTabState(urlTab);
    }
  }, [searchParams, paramName, activeTab]);

  // Update URL when tab changes
  const setActiveTab = useCallback(
    (tab: string) => {
      setActiveTabState(tab);

      // Create new search params
      const params = new URLSearchParams(searchParams.toString());
      params.set(paramName, tab);

      // Update URL
      const newUrl = `${pathname}?${params.toString()}`;
      if (replace) {
        router.replace(newUrl, { scroll: false });
      } else {
        router.push(newUrl, { scroll: false });
      }
    },
    [router, pathname, searchParams, paramName, replace]
  );

  return [activeTab, setActiveTab] as const;
}
