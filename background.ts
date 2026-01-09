// Tab Box background service worker
// Syncs tab groups with chrome.storage.local

import type { StorageData, StorageWindow, StorageGroup, StorageTab } from './web/src/types'

const STORAGE_KEY = "tabbox";

async function getStorage(): Promise<StorageData> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || { windows: {} };
}

async function setStorage(data: StorageData): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: data });
  // Notify listeners
  chrome.runtime.sendMessage({ type: "storageChanged" }).catch(() => { });
}

// Storage data manipulation helpers

function updateGroupEntry(data: StorageData, groupId: number, updateFn: (group: StorageGroup) => void): boolean {
  for (const wId in data.windows) {
    for (const gKey in data.windows[wId].groups) {
      const g = data.windows[wId].groups[gKey];
      if (g.id === groupId) {
        updateFn(g);
        return true;
      }
    }
  }
  return false;
}

// Helper: Find stored group by ID
function findStoredGroupById(data: StorageData, groupId: number | null): { group: StorageGroup; windowId: number; groupKey: string } | null {
  if (!groupId) return null;
  for (const wId in data.windows) {
    for (const gKey in data.windows[wId].groups) {
      const g = data.windows[wId].groups[gKey];
      if (g.id === groupId) {
        return { group: g, windowId: parseInt(wId), groupKey: gKey };
      }
    }
  }
  return null;
}

// Helper: Find stored group by title
function findStoredGroupByTitle(data: StorageData, title: string, preferredWindowId?: number): { group: StorageGroup; windowId: number; groupKey: string } | null {
  let match: { group: StorageGroup; windowId: number; groupKey: string } | null = null;

  for (const wId in data.windows) {
    for (const gKey in data.windows[wId].groups) {
      const g = data.windows[wId].groups[gKey];
      if (g.title === title) {
        const windowId = parseInt(wId);
        if (preferredWindowId && windowId === preferredWindowId) {
          return { group: g, windowId, groupKey: gKey };
        }
        if (!match) {
          match = { group: g, windowId, groupKey: gKey };
        }
      }
    }
  }
  return match;
}

// Helper: Find stored window that best matches chrome window by group names
async function findStoredWindowByGroups(data: StorageData, chromeWindowId: number): Promise<{ window: StorageWindow; storedWindowId: number } | null> {
  const chromeGroups = await chrome.tabGroups.query({ windowId: chromeWindowId });
  if (chromeGroups.length === 0) return null;

  const chromeGroupTitles = chromeGroups.map(g => g.title ?? "").filter(Boolean);
  if (chromeGroupTitles.length === 0) return null;

  let bestMatch: { window: StorageWindow; storedWindowId: number; score: number } | null = null;

  for (const wId in data.windows) {
    const storedWindow = data.windows[wId];
    const storedGroupTitles = Object.values(storedWindow.groups).map(g => g.title).filter(Boolean);

    // Count matching group titles
    const matches = chromeGroupTitles.filter(t => storedGroupTitles.includes(t)).length;
    if (matches > 0 && (!bestMatch || matches > bestMatch.score)) {
      bestMatch = { window: storedWindow, storedWindowId: parseInt(wId), score: matches };
    }
  }

  return bestMatch ? { window: bestMatch.window, storedWindowId: bestMatch.storedWindowId } : null;
}

// Helper: Find stored group containing a tab by tab ID
function findStoredGroupByTabId(data: StorageData, tabId: number): StorageGroup | null {
  for (const wId in data.windows) {
    for (const gKey in data.windows[wId].groups) {
      const g = data.windows[wId].groups[gKey];
      if (g.tabs.some(t => t.id === tabId)) {
        return g;
      }
    }
  }
  return null;
}

// Helper: Move group to different window in storage
function moveStoredGroupToWindow(data: StorageData, fromWindowId: number, groupKey: string, toWindowId: number): void {
  const fromWindow = data.windows[fromWindowId];
  const toWindow = data.windows[toWindowId];
  if (!fromWindow || !toWindow) return;

  const group = fromWindow.groups[groupKey];
  if (group) {
    toWindow.groups[groupKey] = group;
    delete fromWindow.groups[groupKey];
  }
}

// Helper: Map Chrome tabs to StorageTab format
function mapTabsToStored(tabs: chrome.tabs.Tab[]): StorageTab[] {
  return tabs.map(t => ({
    id: t.id ?? null,
    title: t.title || t.url || 'Untitled',
    url: t.url || ''
  }));
}

// Helper: Merge Chrome tabs with stored tabs
// Driven by Chrome tabs: builds new list based on current Chrome state, then adds closed tabs from history
// Automatically removes duplicate closed tabs by URL
function mergeStoredTabs(chromeTabs: chrome.tabs.Tab[], storedTabs: StorageTab[]): StorageTab[] {
  // Map stored tabs by ID for easy lookup
  const storedTabsById = new Map<number, StorageTab>();
  for (const storedTab of storedTabs) {
    if (storedTab.id !== null) {
      storedTabsById.set(storedTab.id, storedTab);
    }
  }

  // Track which stored tabs we've processed
  const processedStoredIds = new Set<number>();

  // First pass: iterate through chromeTabs, lookup storedTabs as you go
  const result: StorageTab[] = [];
  for (const chromeTab of chromeTabs) {
    const chromeId = chromeTab.id!;
    const chromeUrl = chromeTab.url || '';
    const chromeTitle = chromeTab.title || chromeTab.url || 'Untitled';

    // Check if this Chrome tab existed in stored tabs
    if (storedTabsById.has(chromeId)) {
      processedStoredIds.add(chromeId);
    }

    // Add the Chrome tab (always use current Chrome data)
    result.push({
      id: chromeId,
      title: chromeTitle,
      url: chromeUrl
    });
  }

  // Second pass: iterate through remaining stored tabs that weren't updated, add as closed tabs (null id)
  for (const storedTab of storedTabs) {
    if (storedTab.id === null || !processedStoredIds.has(storedTab.id)) {
      // This stored tab wasn't found in chromeTabs, add as closed
      result.push({
        ...storedTab,
        id: null
      });
    }
  }

  // Third pass: deduplicate closed tabs by URL
  // Keep all open tabs, and max 1 closed tab per URL (only if no open tab exists for that URL)
  const urlToOpenTab = new Map<string, StorageTab>();
  const urlToClosedTab = new Map<string, StorageTab>();

  for (const tab of result) {
    if (tab.id !== null) {
      // Track open tabs by URL
      urlToOpenTab.set(tab.url, tab);
    }
  }

  const deduplicated: StorageTab[] = [];
  for (const tab of result) {
    if (tab.id !== null) {
      // Keep all open tabs
      deduplicated.push(tab);
    } else {
      // Closed tab - only keep if:
      // 1. No open tab exists for this URL
      // 2. We haven't already kept a closed tab for this URL
      if (!urlToOpenTab.has(tab.url) && !urlToClosedTab.has(tab.url)) {
        urlToClosedTab.set(tab.url, tab);
        deduplicated.push(tab);
      }
      // else: skip duplicate or shadowed closed tab
    }
  }

  return deduplicated;
}

// Storage sync helpers

async function reconcileAllWindows() {
  // Sync all current windows first
  const windows = await chrome.windows.getAll({ populate: true });
  for (const win of windows) {
    await syncWindow(win.id!);
  }

  // Sync all groups in all windows
  const groups = await chrome.tabGroups.query({});
  for (const group of groups) {
    await syncTabGroup(group.id, group.windowId);
  }

  // Ater syncing data, mark all closed windows and groups as closed (id = null)
  const data = await getStorage();

  // Mark closed windows and groups
  for (const wId in data.windows) {
    const w = data.windows[wId];
    if (w.id !== null) {
      try {
        await chrome.windows.get(w.id);

        // Window exists, check groups
        for (const gKey in w.groups) {
          const g = w.groups[gKey];
          if (g.id !== null) {
            try {
              await chrome.tabGroups.get(g.id);
            } catch {
              // Group doesn't exist
              g.id = null;
            }
          }
        }
      } catch {
        // Window doesn't exist
        w.id = null;
        // Mark all groups as closed
        for (const gKey in w.groups) {
          w.groups[gKey].id = null;
        }
      }
    }
  }

  // Cleanup empty windows
  for (const wId in data.windows) {
    const w = data.windows[wId];
    if (Object.keys(w.groups).length === 0) {
      delete data.windows[wId];
    }
  }

  await setStorage(data);
}

/**
 * Reconcile a single window: mark closed if not in Chrome, 
 * sync its groups if open, and mark any missing groups as closed
 */
async function reconcileWindow(window: StorageWindow) {
  if (!window.id) {
    // Window is already closed, just ensure all groups are marked as closed
    for (const gKey in window.groups) {
      window.groups[gKey].id = null;
    }
    const data = await getStorage();
    // Find this window in storage and update it
    for (const wId in data.windows) {
      if (data.windows[wId] === window) {
        data.windows[wId] = window;
        break;
      }
    }
    await setStorage(data);
    return;
  }

  const originalWindowId = window.id; // Store original ID for lookups

  try {
    await chrome.windows.get(window.id);

    // Window exists in Chrome, sync all its tab groups and mark closed ones
    const chromeGroups = await chrome.tabGroups.query({ windowId: window.id });
    const chromeGroupIds = new Set(chromeGroups.map(g => g.id));

    // Sync each Chrome group
    for (const group of chromeGroups) {
      await syncTabGroup(group.id, window.id);
    }

    // Re-fetch data after syncing (syncTabGroup modifies storage)
    const updatedData = await getStorage();
    // Find this window in storage
    let updatedWindow: StorageWindow | undefined;
    for (const wId in updatedData.windows) {
      if (parseInt(wId) === originalWindowId) {
        updatedWindow = updatedData.windows[wId];
        break;
      }
    }

    if (updatedWindow) {
      // Mark stored groups that don't exist in Chrome as closed
      for (const gKey in updatedWindow.groups) {
        const g = updatedWindow.groups[gKey];
        if (g.id !== null && !chromeGroupIds.has(g.id)) {
          g.id = null;
        }
      }
      await setStorage(updatedData);
    }
  } catch {
    // Window doesn't exist in Chrome, mark it and all groups as closed
    window.id = null;
    for (const gKey in window.groups) {
      window.groups[gKey].id = null;
    }
    const data = await getStorage();
    // Find this window in storage and update it
    for (const wId in data.windows) {
      if (parseInt(wId) === originalWindowId) {
        data.windows[wId] = window;
        break;
      }
    }
    await setStorage(data);
  }
}

/**
 * Ensures stored window exists and is up to date
 * Updates all groups' windowId as needed
 */
async function syncWindow(windowId: number) {
  const data = await getStorage();

  // First try to lookup stored window by id
  if (data.windows[windowId]) {
    // Window already synced correctly
    return;
  }

  // Try to find stored window by matching group names
  const match = await findStoredWindowByGroups(data, windowId);

  if (match) {
    // Found a stored window with matching groups - update its ID
    const oldWindowId = match.storedWindowId;
    const storedWindow = match.window;

    // Move window entry to new ID
    data.windows[windowId] = {
      ...storedWindow,
      id: windowId
    };
    delete data.windows[oldWindowId];

    // Update all groups' windowId
    for (const gKey in data.windows[windowId].groups) {
      data.windows[windowId].groups[gKey].windowId = windowId;
    }

    await setStorage(data);
  } else {
    // Create new window entry
    data.windows[windowId] = {
      id: windowId,
      groups: {}
    };
    await setStorage(data);
  }
}

/**
 * Ensures stored group exists and is up to date
 * Moves group to correct window as needed
 */
async function syncTabGroup(groupId: number, windowId: number) {
  const group = await chrome.tabGroups.get(groupId).catch(() => null);
  if (!group) return;

  const tabs = await chrome.tabs.query({ groupId });
  const data = await getStorage();

  // Ensure window exists -- should exist by this point, maybe timing issue when detaching groups?
  if (!data.windows[windowId]) {
    await syncWindow(windowId);
    return syncTabGroup(groupId, windowId); // Retry after syncing window
  }

  // First try to lookup stored group by id
  let stored = findStoredGroupById(data, groupId);

  // If not found by id, try by title in the same window first (window should exist by this point)
  if (!stored) {
    stored = findStoredGroupByTitle(data, group.title || '', windowId);
  }

  // If still not found, try by title in any window
  // if (!stored) {
  //   stored = findStoredGroupByTitle(data, group.title || '');
  // }

  // Merge tabs: keep existing stored tabs, update or close them, add new ones
  const mergedTabs = stored ? mergeStoredTabs(tabs, stored.group.tabs) : mapTabsToStored(tabs);

  // Prepare updated group data
  const groupData: StorageGroup = {
    id: groupId,
    title: group.title || '',
    color: group.color || null,
    windowId: windowId,
    collapsed: group.collapsed,
    tabs: mergedTabs
  };

  if (stored) {
    // Update existing stored group
    Object.assign(stored.group, groupData);

    // Move to correct window if needed
    if (stored.windowId !== windowId) {
      moveStoredGroupToWindow(data, stored.windowId, stored.groupKey, windowId);
    }
  } else {
    // Create new stored group entry
    data.windows[windowId].groups[groupId] = groupData;
  }

  await setStorage(data);
}


// Focus helpers
// When called, we expect the storage data to be correctly synced
// Missing or null ids indicate closed items that need to be opened and stored ids updated

async function focusOrOpenWindow(window: StorageWindow): Promise<number> {
  // If window.id is provided, try to focus that window
  if (window.id) {
    try {
      await chrome.windows.get(window.id);
      await chrome.windows.update(window.id, { focused: true });
      return window.id;
    } catch {
      // Window doesn't exist, need to create it
    }
  }

  // Open new window
  const newWindow = await chrome.windows.create({});
  const newId = newWindow.id!;

  // Update stored window id and all stored groups' window ids
  const data = await getStorage();
  const oldId = window.id;

  // Find this window in storage by reference or old ID
  let storedWindowId: number | null = null;
  for (const wId in data.windows) {
    if (data.windows[wId] === window || parseInt(wId) === oldId) {
      storedWindowId = parseInt(wId);
      break;
    }
  }

  if (storedWindowId !== null) {
    // Update window entry
    const storedWindow = data.windows[storedWindowId];
    storedWindow.id = newId;

    // Update all groups' windowId
    for (const gKey in storedWindow.groups) {
      storedWindow.groups[gKey].windowId = newId;
    }

    // Move to new ID if different
    if (storedWindowId !== newId) {
      data.windows[newId] = storedWindow;
      delete data.windows[storedWindowId];
    }

    await setStorage(data);
  }

  await chrome.windows.update(newId, { focused: true });
  return newId;
}

async function focusOrOpenGroup(group: StorageGroup, window: StorageWindow): Promise<number> {
  // If group.id is provided, try to focus that group
  if (group.id) {
    try {
      const chromeGroup = await chrome.tabGroups.get(group.id);
      const tabs = await chrome.tabs.query({ groupId: chromeGroup.id });
      await chrome.windows.update(chromeGroup.windowId, { focused: true });
      if (tabs.length > 0) {
        await chrome.tabs.update(tabs[0].id!, { active: true });
      }
      return chromeGroup.id;
    } catch {
      // Group doesn't exist, need to create it
    }
  }

  // Ensure window exists
  const windowId = await focusOrOpenWindow(window);

  // Create new group in that window with stored tabs (excluding closed/history tabs)
  const createdTabIds: number[] = [];
  const tabsToCreate = group.tabs.filter(t => t.id !== null);
  for (const tab of tabsToCreate) {
    const newTab = await chrome.tabs.create({
      windowId,
      url: tab.url,
      active: false
    });
    createdTabIds.push(newTab.id!);
  }

  let newGroupId: number;
  if (createdTabIds.length > 0) {
    newGroupId = await chrome.tabs.group({
      tabIds: createdTabIds,
      createProperties: { windowId }
    });

    await chrome.tabGroups.update(newGroupId, {
      title: group.title,
      color: group.color || undefined
    });

    // Focus first tab
    if (createdTabIds.length > 0) {
      await chrome.tabs.update(createdTabIds[0], { active: true });
    }
  } else {
    // Create empty group
    const tempTab = await chrome.tabs.create({ windowId, active: false });
    newGroupId = await chrome.tabs.group({
      tabIds: [tempTab.id!],
      createProperties: { windowId }
    });
    await chrome.tabGroups.update(newGroupId, {
      title: group.title,
      color: group.color || undefined
    });
    await chrome.tabs.remove(tempTab.id!);
  }

  // Update stored group id and windowId
  const data = await getStorage();
  const stored = findStoredGroupById(data, group.id) || findStoredGroupByTitle(data, group.title);
  if (stored) {
    stored.group.id = newGroupId;
    stored.group.windowId = windowId;
    // Update tabs: map created tab IDs back to the tabs that were created, keep closed tabs as-is
    let createdIdx = 0;
    stored.group.tabs = group.tabs.map((t) => {
      if (t.id !== null && createdIdx < createdTabIds.length) {
        // This tab was created, update its ID
        return { ...t, id: createdTabIds[createdIdx++] };
      } else {
        // This tab wasn't created (was closed/history), keep it as-is
        return { ...t, id: null };
      }
    });

    // Move to correct window if needed
    if (stored.windowId !== windowId) {
      moveStoredGroupToWindow(data, stored.windowId, stored.groupKey, windowId);
      // Update key if needed
      if (data.windows[windowId]) {
        data.windows[windowId].groups[String(newGroupId)] = stored.group;
        delete data.windows[windowId].groups[stored.groupKey];
      }
    } else {
      // Update key in same window
      const win = data.windows[windowId];
      if (win && stored.groupKey !== String(newGroupId)) {
        win.groups[String(newGroupId)] = stored.group;
        delete win.groups[stored.groupKey];
      }
    }

    await setStorage(data);
  }

  return newGroupId;
}

async function focusOrOpenTab(tab: StorageTab, group: StorageGroup, window: StorageWindow): Promise<number> {
  // If tab.id is provided, try to focus that tab
  if (tab.id) {
    try {
      const chromeTab = await chrome.tabs.get(tab.id);
      await chrome.windows.update(chromeTab.windowId!, { focused: true });
      await chrome.tabs.update(chromeTab.id!, { active: true });
      return chromeTab.id!;
    } catch {
      // Tab doesn't exist
    }
  }

  // Ensure group exists
  const groupId = await focusOrOpenGroup(group, window);

  // Check if tab already exists in the group by URL
  const existingTabs = await chrome.tabs.query({ groupId, url: tab.url });
  if (existingTabs.length > 0) {
    await chrome.tabs.update(existingTabs[0].id!, { active: true });
    return existingTabs[0].id!;
  }

  // Create new tab in the group
  const chromeGroup = await chrome.tabGroups.get(groupId);
  const newTab = await chrome.tabs.create({
    windowId: chromeGroup.windowId,
    url: tab.url,
    active: true
  });

  await chrome.tabs.group({ tabIds: [newTab.id!], groupId });

  // Update stored tab id
  const data = await getStorage();
  const stored = findStoredGroupById(data, groupId);
  if (stored) {
    const storedTab = stored.group.tabs.find(t => t.url === tab.url);
    if (storedTab) {
      storedTab.id = newTab.id!;
      storedTab.title = newTab.title || newTab.url || 'Untitled';
    } else {
      stored.group.tabs.push({
        id: newTab.id!,
        title: newTab.title || newTab.url || 'Untitled',
        url: newTab.url || ''
      });
    }
    await setStorage(data);
  }

  return newTab.id!;
}

// Messaging from panel
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg && msg.type === "openWindow" && msg.window) {
        const windowId = await focusOrOpenWindow(msg.window as StorageWindow);
        sendResponse({ ok: true, windowId });
      } else if (msg && msg.type === "openGroup" && msg.group && msg.window) {
        const groupId = await focusOrOpenGroup(msg.group as StorageGroup, msg.window as StorageWindow);
        sendResponse({ ok: true, groupId });
      } else if (msg && msg.type === "openTab" && msg.tab && msg.group && msg.window) {
        const tabId = await focusOrOpenTab(msg.tab as StorageTab, msg.group as StorageGroup, msg.window as StorageWindow);
        sendResponse({ ok: true, tabId });
      } else if (msg && msg.type === "getFocusedWindowId") {
        const current = await chrome.windows.getLastFocused({ populate: false });
        sendResponse({ ok: true, windowId: current.id });
      } else if (msg && msg.type === "getStorage") {
        const data = await getStorage();
        sendResponse({ ok: true, data });
      } else if (msg && msg.type === "closeGroup" && msg.groupId) {
        try {
          const tabs = await chrome.tabs.query({ groupId: msg.groupId });
          const tabIds = tabs.map(t => t.id!);
          if (tabIds.length > 0) {
            await chrome.tabs.remove(tabIds);
          }
          sendResponse({ ok: true });
        } catch (e) {
          sendResponse({ ok: false, error: String(e) });
        }
      } else if (msg && msg.type === "deleteGroup" && msg.windowKey && msg.groupKey) {
        const data = await getStorage();
        if (data.windows[msg.windowKey] && data.windows[msg.windowKey].groups[msg.groupKey]) {
          delete data.windows[msg.windowKey].groups[msg.groupKey];
          await setStorage(data);
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: false, error: "Group not found" });
        }
      } else if (msg && msg.type === "deleteWindow" && msg.windowKey) {
        const data = await getStorage();
        if (data.windows[msg.windowKey]) {
          delete data.windows[msg.windowKey];
          await setStorage(data);
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: false, error: "Window not found" });
        }
      } else if (msg && msg.type === "setWindowName" && msg.windowKey !== undefined) {
        const data = await getStorage();
        const win = data.windows[msg.windowKey];
        if (win) {
          const name = typeof msg.name === "string" ? msg.name.trim() : "";
          if (name) {
            win.name = name;
          } else {
            delete win.name;
          }
          await setStorage(data);
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: false, error: "Window not found" });
        }
      } else if (msg && msg.type === "deleteClosedTabs" && msg.windowKey && msg.groupKey) {
        const data = await getStorage();
        if (data.windows[msg.windowKey] && data.windows[msg.windowKey].groups[msg.groupKey]) {
          const group = data.windows[msg.windowKey].groups[msg.groupKey];
          group.tabs = group.tabs.filter(t => t.id !== null);
          await setStorage(data);
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: false, error: "Group not found" });
        }
      } else if (msg && msg.type === "deleteTab" && msg.windowKey && msg.groupKey && msg.tabId !== undefined) {
        const data = await getStorage();
        if (data.windows[msg.windowKey] && data.windows[msg.windowKey].groups[msg.groupKey]) {
          const group = data.windows[msg.windowKey].groups[msg.groupKey];
          group.tabs = group.tabs.filter(t => t.id !== msg.tabId);
          await setStorage(data);
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: false, error: "Group not found" });
        }
      } else {
        sendResponse({ ok: false, error: "Unknown message" });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
  })();
  return true; // keep channel open for async
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId === 'resync-all') {
    console.log('[TabBox] Resyncing all data via context menu');
    await reconcileAllWindows();
  }
});

// Event wiring
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[TabBox] Extension installed, reconciling all data');
  // setOptions may not be available in all Chrome versions
  if (chrome.sidePanel && typeof chrome.sidePanel.setOptions === 'function') {
    await chrome.sidePanel.setOptions({ path: "web/dist/index.html", enabled: true }).catch(() => { });
  }

  // Create context menu for action button
  chrome.contextMenus.create({
    id: 'resync-all',
    title: 'Refresh Side Panel',
    contexts: ['action']
  });

  await reconcileAllWindows();
});

chrome.runtime.onStartup?.addListener(async () => {
  console.log('[TabBox] Chrome startup, reconciling all data');
  await reconcileAllWindows();
});

chrome.action.onClicked.addListener(async (tab) => {
  if (tab && tab.windowId !== undefined) {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  }
});

// Chrome events trigger lightweight individual syncs
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  console.log('[TabBox] Window focus changed:', windowId);
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  // notify panel
  chrome.runtime.sendMessage({ type: "windowFocused", windowId }).catch(() => { });
});

chrome.windows.onRemoved.addListener(async (windowId) => {
  console.log('[TabBox] Window removed:', windowId);
  // Mark window and all its groups as closed but keep data
  const data = await getStorage();
  const window = data.windows[windowId];
  if (window) {
    window.id = null;
    // Also null out all groups in this window
    for (const gKey in window.groups) {
      window.groups[gKey].id = null;
    }
    await setStorage(data);
  }
});

// Tab Groups sync - sync only the affected group
chrome.tabGroups.onCreated.addListener(async (group) => {
  console.log('[TabBox] Tab group created:', group.id, group.title);
  await syncTabGroup(group.id, group.windowId);
});
chrome.tabGroups.onUpdated.addListener(async (group) => {
  console.log('[TabBox] Tab group updated:', group.id, group.title);
  await syncTabGroup(group.id, group.windowId);
});
chrome.tabGroups.onMoved.addListener(async (group) => {
  console.log('[TabBox] Tab group moved:', group.id, 'to window', group.windowId);
  await syncTabGroup(group.id, group.windowId);
});
chrome.tabGroups.onRemoved.addListener(async (group) => {
  console.log('[TabBox] Tab group removed:', group.id);
  // Mark group as closed but keep data
  const data = await getStorage();
  updateGroupEntry(data, group.id, (g) => { g.id = null });
  await setStorage(data);
});

// Tabs changes - sync the affected group
chrome.tabs.onCreated.addListener(async (tab) => {
  console.log('[TabBox] Tab created:', tab.id, 'groupId:', tab.groupId);
  if (tab.groupId && tab.groupId !== -1) await syncTabGroup(tab.groupId, tab.windowId);
});
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tab.groupId && tab.groupId !== -1 && (changeInfo.url || changeInfo.title)) {
    console.log('[TabBox] Tab updated:', tabId, 'groupId:', tab.groupId);
    await syncTabGroup(tab.groupId, tab.windowId);
  }
});
chrome.tabs.onMoved.addListener(async (tabId, moveInfo) => {
  console.log('[TabBox] Tab moved:', tabId, 'fromIndex:', moveInfo.fromIndex, 'toIndex:', moveInfo.toIndex);
  const tab = await chrome.tabs.get(tabId);
  if (tab.groupId && tab.groupId !== -1) await syncTabGroup(tab.groupId, moveInfo.windowId);
});
chrome.tabs.onDetached.addListener(async (tabId, detachInfo) => {
  console.log('[TabBox] Tab detached:', tabId, 'from window:', detachInfo.oldWindowId);
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (tab && tab.groupId && tab.groupId !== -1) await syncTabGroup(tab.groupId, detachInfo.oldWindowId);
});
chrome.tabs.onAttached.addListener(async (tabId, attachInfo) => {
  console.log('[TabBox] Tab attached:', tabId, 'to window:', attachInfo.newWindowId);
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (tab && tab.groupId && tab.groupId !== -1) await syncTabGroup(tab.groupId, attachInfo.newWindowId);
});
chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  console.log('[TabBox] Tab removed:', tabId);
  const data = await getStorage();
  const group = findStoredGroupByTabId(data, tabId);
  if (group) await syncTabGroup(group.id!, removeInfo.windowId);
});