/**
 * Storage model types for Tab Box extension.
 * Used by both the background service worker and the React side panel UI.
 */

/**
 * A stored tab entry (may or may not be open in Chrome).
 */
export interface StorageTab {
  id: number | null; // Chrome tab ID (null if not open)
  title: string;
  url: string;
}

/**
 * A stored tab group (may or may not be open in Chrome).
 */
export interface StorageGroup {
  id: number | null; // Chrome group ID (null if not open)
  title: string;
  color: chrome.tabGroups.ColorEnum | null;
  windowId: number | null; // Chrome window ID (null if not open)
  collapsed?: boolean; // Synced from Chrome tabGroup.collapsed state
  tabs: StorageTab[];
}

/**
 * A stored window entry (may or may not be open in Chrome).
 */
export interface StorageWindow {
  id: number | null; // Chrome window ID (null if not open)
  name?: string; // Optional user-defined name
  groups: Record<string, StorageGroup>; // keyed by group ID
}

/**
 * Complete storage data structure.
 */
export interface StorageData {
  windows: Record<string, StorageWindow>; // keyed by window ID
}

/**
 * UI representation of a tab item.
 */
export interface TabItem extends StorageTab { }

/**
 * UI representation of a group item.
 */
export interface GroupItem extends Omit<StorageGroup, 'tabs'> {
  key: string; // storage key for React rendering
  tabs: TabItem[];
}

/**
 * UI representation of a window item.
 */
export interface WindowItem extends Omit<StorageWindow, 'groups'> {
  key: string; // storage key for React rendering
  groups: GroupItem[];
}
