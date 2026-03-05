export interface TabSelectionCandidate {
  id?: number;
  active?: boolean;
}

/** Parse stored selected-tab value from module state. */
export function parseSelectedTabId(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

/**
 * Resolve the selected tab ID against current YTM tabs.
 *
 * Preference order:
 * 1. Existing selected tab (if it still exists)
 * 2. Active YTM tab
 * 3. First YTM tab
 * 4. null when no YTM tabs exist
 */
export function resolveSelectedTabId(
  tabs: TabSelectionCandidate[],
  selectedTabId: number | null,
): number | null {
  const exists =
    selectedTabId !== null && tabs.some((tab) => tab.id === selectedTabId);
  if (exists) return selectedTabId;

  const activeTab = tabs.find(
    (tab) => tab.active === true && tab.id !== undefined,
  );
  if (activeTab?.id !== undefined) return activeTab.id;

  const firstTab = tabs.find((tab) => tab.id !== undefined);
  if (firstTab?.id !== undefined) return firstTab.id;

  return null;
}
