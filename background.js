// Tab Box background service worker
// Syncs tab groups with bookmarks under a root folder "Tab Box"

const ROOT_FOLDER_TITLE = "Tab Box";
const META_BOOKMARK_URL = "tabbox:meta"; // special marker bookmark url for metadata

function findBookmarkFolder(nodes, folderType, id) {
  const byFolderType = nodes.find(n => "folderType" in n && n.folderType === folderType);
  if (byFolderType) return byFolderType;
  return nodes.find(n => String(n.id) === String(id) && !n.url);
}

async function getRootFolder() {
  const tree = await chrome.bookmarks.getTree();
  const roots = tree[0].children || [];
  // Use special folder IDs: "2" is typically "Other Bookmarks", "1" is "Bookmarks Bar"
  // Prefer "Other Bookmarks"; fallback to "Bookmarks Bar" or first available
  const parent = findBookmarkFolder(roots, "other", "2") || findBookmarkFolder(roots, "bookmark-bar", "1") || roots[0];
  if (!parent) {
    throw new Error("Could not find a valid bookmarks folder");
  }
  // Search for existing root under parent
  const children = await chrome.bookmarks.getChildren(parent.id).catch(() => []);
  let root = children.find((n) => n.title === ROOT_FOLDER_TITLE && !n.url);
  if (!root) {
    root = await chrome.bookmarks.create({ parentId: parent.id, title: ROOT_FOLDER_TITLE });
  }
  return root;
}

async function findWindowFolderByMeta(rootId, windowId) {
  const children = await chrome.bookmarks.getChildren(rootId).catch(() => []);
  for (const child of children) {
    if (child.url) continue; // only folders
    // find meta bookmark inside
    const folderChildren = await chrome.bookmarks.getChildren(child.id).catch(() => []);
    const meta = folderChildren.find((b) => b.url === META_BOOKMARK_URL);
    if (meta) {
      try {
        const data = JSON.parse(meta.title);
        if (data && data.windowId === windowId) return child;
      } catch { }
    }
  }
  return null;
}

async function getOrCreateWindowFolder(windowId, windowTitle) {
  const root = await getRootFolder();
  // Try to find by metadata first
  let folder = await findWindowFolderByMeta(root.id, windowId);
  const title = windowTitle || `Window ${windowId}`;
  if (!folder) {
    // Try by title match as fallback
    const children = await chrome.bookmarks.getChildren(root.id).catch(() => []);
    folder = children.find((n) => !n.url && n.title === title);
  }
  if (!folder) {
    folder = await chrome.bookmarks.create({ parentId: root.id, title });
  } else if ((folder.title || "") !== title) {
    await chrome.bookmarks.update(folder.id, { title });
  }
  // Ensure metadata is up to date
  await ensureMetaBookmark(folder.id, { windowId, title });
  return folder;
}

async function findGroupFolderByMeta(parentId, groupId) {
  const children = await chrome.bookmarks.getChildren(parentId).catch(() => []);
  for (const child of children) {
    if (child.url) continue; // only folders
    // find meta bookmark inside
    const folderChildren = await chrome.bookmarks.getChildren(child.id).catch(() => []);
    const meta = folderChildren.find((b) => b.url === META_BOOKMARK_URL);
    if (meta) {
      try {
        const data = JSON.parse(meta.title);
        if (data && data.groupId === groupId) return child;
      } catch { }
    }
  }
  return null;
}

async function ensureMetaBookmark(folderId, meta) {
  const children = await chrome.bookmarks.getChildren(folderId).catch(() => []);
  const existing = children.find((b) => b.url === META_BOOKMARK_URL);
  const title = JSON.stringify(meta);
  if (existing) {
    await chrome.bookmarks.update(existing.id, { title });
    return existing;
  }
  return chrome.bookmarks.create({ parentId: folderId, title, url: META_BOOKMARK_URL });
}

async function writeGroupTabs(folderId, tabs) {
  const children = await chrome.bookmarks.getChildren(folderId).catch(() => []);
  // keep meta bookmark, remove other bookmarks
  const toDelete = children.filter((b) => b.url && b.url !== META_BOOKMARK_URL);
  for (const b of toDelete) {
    await chrome.bookmarks.remove(b.id).catch(() => { });
  }
  for (const t of tabs) {
    await chrome.bookmarks.create({ parentId: folderId, title: t.title || t.url, url: t.url });
  }
}

async function syncTabGroup(groupId) {
  try {
    const group = await chrome.tabGroups.get(groupId);
    const tabs = await chrome.tabs.query({ groupId });
    const window = await chrome.windows.get(group.windowId);
    const windowFolder = await getOrCreateWindowFolder(group.windowId, window.title);
    let groupFolder = await findGroupFolderByMeta(windowFolder.id, group.id);
    const groupTitle = group.title || "";
    if (!groupFolder) {
      // try by title match
      const children = await chrome.bookmarks.getChildren(windowFolder.id).catch(() => []);
      groupFolder = children.find((n) => !n.url && n.title === groupTitle);
    }
    if (!groupFolder) {
      groupFolder = await chrome.bookmarks.create({ parentId: windowFolder.id, title: groupTitle });
    } else if ((groupFolder.title || "") !== groupTitle) {
      await chrome.bookmarks.update(groupFolder.id, { title: groupTitle });
    }
    await ensureMetaBookmark(groupFolder.id, { groupId: group.id, title: groupTitle, color: group.color || null, windowId: group.windowId });
    await writeGroupTabs(groupFolder.id, tabs);
  } catch (e) {
    // group may not exist anymore
  }
}

async function syncWindow(windowId) {
  try {
    const window = await chrome.windows.get(windowId);
    await getOrCreateWindowFolder(window.id, window.title);
  } catch (e) {
    // window may not exist anymore
  }
}

async function syncAllCurrent() {
  const windows = await chrome.windows.getAll({ populate: false });
  for (const w of windows) {
    await getOrCreateWindowFolder(w.id, w.title);
  }
  const allGroups = await chrome.tabGroups.query({});
  for (const g of allGroups) {
    await syncTabGroup(g.id);
  }
}

// Focus helpers
async function focusWindow(windowId) {
  const windows = await chrome.windows.getAll({ populate: false });
  const exists = windows.find((w) => w.id === windowId);
  if (exists) {
    await chrome.windows.update(windowId, { focused: true });
    return { focused: true };
  }
  // Recreate window by opening all groups and tabs saved under its folder
  const root = await getRootFolder();
  const windowFolder = await findWindowFolderByMeta(root.id, windowId);
  if (!windowFolder) {
    return { error: "Window folder not found" };
  }
  const groupFolders = (await chrome.bookmarks.getChildren(windowFolder.id)).filter((c) => !c.url);
  const newWindow = await chrome.windows.create({});
  for (const gf of groupFolders) {
    await openGroupFolderInWindow(gf.id, newWindow.id);
  }
  return { created: true, windowId: newWindow.id };
}

async function openGroupFolderInWindow(groupFolderId, targetWindowId) {
  const children = await chrome.bookmarks.getChildren(groupFolderId).catch(() => []);
  const metaBookmark = children.find((c) => c.url === META_BOOKMARK_URL);
  let meta = { title: "", color: null };
  if (metaBookmark) {
    try { meta = JSON.parse(metaBookmark.title) || meta; } catch { }
  }
  const tabBookmarks = children.filter((c) => c.url && c.url !== META_BOOKMARK_URL);
  const createdTabIds = [];
  for (const b of tabBookmarks) {
    const tab = await chrome.tabs.create({ windowId: targetWindowId, url: b.url, active: false });
    createdTabIds.push(tab.id);
  }
  if (createdTabIds.length) {
    const groupId = await chrome.tabs.group({ tabIds: createdTabIds, createProperties: { windowId: targetWindowId } });
    await chrome.tabGroups.update(groupId, { title: meta.title || "", color: meta.color || undefined });
    // Update meta with new ephemeral groupId
    await ensureMetaBookmark(groupFolderId, { ...meta, groupId, windowId: targetWindowId });
  }
}

async function focusOrOpenGroupByFolder(groupFolderId) {
  // Try to focus existing tabs using stored groupId
  const children = await chrome.bookmarks.getChildren(groupFolderId).catch(() => []);
  const metaBookmark = children.find((c) => c.url === META_BOOKMARK_URL);
  let meta = null;
  if (metaBookmark) {
    try { meta = JSON.parse(metaBookmark.title); } catch { }
  }
  if (meta && meta.groupId) {
    try {
      const group = await chrome.tabGroups.get(meta.groupId);
      const tabs = await chrome.tabs.query({ groupId: group.id });
      if (tabs.length) {
        await chrome.windows.update(group.windowId, { focused: true });
        await chrome.tabs.update(tabs[0].id, { active: true });
        return;
      }
    } catch { }
  }
  // Otherwise open in current focused window
  const current = await chrome.windows.getLastFocused({ populate: false });
  await openGroupFolderInWindow(groupFolderId, current.id);
}

async function focusOrOpenTabByBookmark(bookmarkId) {
  const b = await chrome.bookmarks.get(bookmarkId).then((res) => res[0]);
  if (!b || !b.url) return;
  const tabs = await chrome.tabs.query({ url: b.url });
  if (tabs.length) {
    await chrome.windows.update(tabs[0].windowId, { focused: true });
    await chrome.tabs.update(tabs[0].id, { active: true });
    return;
  }
  const current = await chrome.windows.getLastFocused({ populate: false });
  await chrome.tabs.create({ windowId: current.id, url: b.url, active: true });
}

// Messaging from panel
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg && msg.type === "focusWindow" && msg.windowId) {
        const r = await focusWindow(msg.windowId);
        sendResponse({ ok: true, result: r });
      } else if (msg && msg.type === "focusWindowFolder" && msg.folderId) {
        // Recreate a window from a folder when no known windowId exists
        const newWindow = await chrome.windows.create({});
        const groupFolders = (await chrome.bookmarks.getChildren(msg.folderId)).filter((c) => !c.url);
        for (const gf of groupFolders) {
          await openGroupFolderInWindow(gf.id, newWindow.id);
        }
        sendResponse({ ok: true, windowId: newWindow.id });
      } else if (msg && msg.type === "openGroupFolder" && msg.folderId) {
        await focusOrOpenGroupByFolder(msg.folderId);
        sendResponse({ ok: true });
      } else if (msg && msg.type === "openTabBookmark" && msg.bookmarkId) {
        await focusOrOpenTabByBookmark(msg.bookmarkId);
        sendResponse({ ok: true });
      } else if (msg && msg.type === "getFocusedWindowId") {
        const current = await chrome.windows.getLastFocused({ populate: false });
        sendResponse({ ok: true, windowId: current.id });
      } else {
        sendResponse({ ok: false, error: "Unknown message" });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
  })();
  return true; // keep channel open for async
});

// Event wiring
chrome.runtime.onInstalled.addListener(async () => {
  // setOptions may not be available in all Chrome versions
  if (chrome.sidePanel && typeof chrome.sidePanel.setOptions === 'function') {
    await chrome.sidePanel.setOptions({ path: "web/dist/index.html", enabled: true }).catch(() => { });
  }
  await syncAllCurrent();
});

chrome.action.onClicked.addListener(async (tab) => {
  if (tab && tab.windowId !== undefined) {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  // ensure window folder exists and is up to date
  await syncWindow(windowId);
  // notify panel
  chrome.runtime.sendMessage({ type: "windowFocused", windowId }).catch(() => { });
});

// Window title changes (Chrome 136+)
if (chrome.windows.onBoundsChanged) {
  chrome.windows.onBoundsChanged.addListener(async (window) => {
    await syncWindow(window.id);
  });
}

// Tab Groups sync
chrome.tabGroups.onCreated.addListener(async (group) => {
  await syncTabGroup(group.id);
});
chrome.tabGroups.onUpdated.addListener(async (group) => {
  await syncTabGroup(group.id);
});
chrome.tabGroups.onMoved.addListener(async (group) => {
  await syncTabGroup(group.id);
});
chrome.tabGroups.onRemoved.addListener(async (group) => {
  // Do not remove from bookmarks
});

// Tabs changes affecting groups
chrome.tabs.onCreated.addListener(async (tab) => {
  if (tab.groupId && tab.groupId !== -1) await syncTabGroup(tab.groupId);
});
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tab.groupId && tab.groupId !== -1 && (changeInfo.url || changeInfo.title)) await syncTabGroup(tab.groupId);
});
chrome.tabs.onMoved.addListener(async (tabId, moveInfo) => {
  const tab = await chrome.tabs.get(tabId);
  if (tab.groupId && tab.groupId !== -1) await syncTabGroup(tab.groupId);
});
chrome.tabs.onDetached.addListener(async (tabId, detachInfo) => {
  // previous group changed
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (tab && tab.groupId && tab.groupId !== -1) await syncTabGroup(tab.groupId);
});
chrome.tabs.onAttached.addListener(async (tabId, attachInfo) => {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (tab && tab.groupId && tab.groupId !== -1) await syncTabGroup(tab.groupId);
});

// Bookmarks listener to notify panel to refresh
chrome.bookmarks.onChanged.addListener((id, info) => {
  chrome.runtime.sendMessage({ type: "bookmarksChanged" }).catch(() => { });
});
chrome.bookmarks.onCreated.addListener((id, node) => {
  chrome.runtime.sendMessage({ type: "bookmarksChanged" }).catch(() => { });
});
chrome.bookmarks.onRemoved.addListener((id, info) => {
  chrome.runtime.sendMessage({ type: "bookmarksChanged" }).catch(() => { });
});
