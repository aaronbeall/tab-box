// Tab Box background service worker
// Syncs tab groups with chrome.storage.local

const STORAGE_KEY = "tabbox";

// Storage structure: { tabbox: { windows: { [windowId]: { id, title, groups: { [groupId]: { id, title, color, windowId, tabs: [] } } } } } }

async function getStorage() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || { windows: {} };
}

async function setStorage(data) {
  await chrome.storage.local.set({ [STORAGE_KEY]: data });
  // Notify listeners
  chrome.runtime.sendMessage({ type: "storageChanged" }).catch(() => { });
}

async function getOrCreateWindow(windowId, windowTitle) {
  const data = await getStorage();
  const title = windowTitle || `Window ${windowId}`;
  if (!data.windows[windowId]) {
    data.windows[windowId] = { id: windowId, title, groups: {} };
  } else if (data.windows[windowId].title !== title) {
    data.windows[windowId].title = title;
  }
  await setStorage(data);
  return data.windows[windowId];
}

async function deleteWindow(windowId) {
  const data = await getStorage();
  if (data.windows[windowId]) {
    delete data.windows[windowId];
    await setStorage(data);
  }
}

async function syncTabGroup(groupId) {
  try {
    const group = await chrome.tabGroups.get(groupId);
    const tabs = await chrome.tabs.query({ groupId });
    const data = await getStorage();
    await getOrCreateWindow(group.windowId, "");
    const groupTitle = group.title || "";
    if (!data.windows[group.windowId]) {
      data.windows[group.windowId] = { id: group.windowId, title: `Window ${group.windowId}`, groups: {} };
    }
    data.windows[group.windowId].groups[groupId] = {
      id: groupId,
      title: groupTitle,
      color: group.color || null,
      windowId: group.windowId,
      tabs: tabs.map((t) => ({ id: t.id, title: t.title || t.url, url: t.url }))
    };
    await setStorage(data);
  } catch (e) {
    // group may not exist anymore
  }
}

async function removeTabGroup(groupId) {
  const data = await getStorage();
  for (const windowId in data.windows) {
    if (data.windows[windowId].groups[groupId]) {
      delete data.windows[windowId].groups[groupId];
      await setStorage(data);
      break;
    }
  }
}

async function syncWindow(windowId) {
  try {
    const window = await chrome.windows.get(windowId);
    await getOrCreateWindow(window.id, `Window ${window.id}`);
  } catch (e) {
    // window may not exist anymore
  }
}

async function syncAllCurrent() {
  const windows = await chrome.windows.getAll({ populate: false });
  for (const w of windows) {
    await getOrCreateWindow(w.id, `Window ${w.id}`);
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
  // Recreate window from storage
  const data = await getStorage();
  const windowData = data.windows[windowId];
  if (!windowData) {
    return { error: "Window not found" };
  }
  const newWindow = await chrome.windows.create({});
  for (const groupId in windowData.groups) {
    await openGroupInWindow(windowData.groups[groupId], newWindow.id);
  }
  return { created: true, windowId: newWindow.id };
}

async function openGroupInWindow(groupData, targetWindowId) {
  const createdTabIds = [];
  for (const tab of groupData.tabs) {
    const newTab = await chrome.tabs.create({ windowId: targetWindowId, url: tab.url, active: false });
    createdTabIds.push(newTab.id);
  }
  if (createdTabIds.length) {
    const groupId = await chrome.tabs.group({ tabIds: createdTabIds, createProperties: { windowId: targetWindowId } });
    await chrome.tabGroups.update(groupId, { title: groupData.title || "", color: groupData.color || undefined });
  }
}

async function focusOrOpenGroup(groupId) {
  // Try to focus existing group
  try {
    const group = await chrome.tabGroups.get(groupId);
    const tabs = await chrome.tabs.query({ groupId: group.id });
    if (tabs.length) {
      await chrome.windows.update(group.windowId, { focused: true });
      await chrome.tabs.update(tabs[0].id, { active: true });
      return;
    }
  } catch { }
  // Otherwise open from storage in current window
  const data = await getStorage();
  let groupData = null;
  for (const windowId in data.windows) {
    if (data.windows[windowId].groups[groupId]) {
      groupData = data.windows[windowId].groups[groupId];
      break;
    }
  }
  if (!groupData) return;
  const current = await chrome.windows.getLastFocused({ populate: false });
  await openGroupInWindow(groupData, current.id);
}

async function focusOrOpenTab(tabUrl) {
  const tabs = await chrome.tabs.query({ url: tabUrl });
  if (tabs.length) {
    await chrome.windows.update(tabs[0].windowId, { focused: true });
    await chrome.tabs.update(tabs[0].id, { active: true });
    return;
  }
  const current = await chrome.windows.getLastFocused({ populate: false });
  await chrome.tabs.create({ windowId: current.id, url: tabUrl, active: true });
}

// Messaging from panel
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg && msg.type === "focusWindow" && msg.windowId) {
        const r = await focusWindow(msg.windowId);
        sendResponse({ ok: true, result: r });
      } else if (msg && msg.type === "openGroup" && msg.groupId) {
        await focusOrOpenGroup(msg.groupId);
        sendResponse({ ok: true });
      } else if (msg && msg.type === "openTab" && msg.url) {
        await focusOrOpenTab(msg.url);
        sendResponse({ ok: true });
      } else if (msg && msg.type === "getFocusedWindowId") {
        const current = await chrome.windows.getLastFocused({ populate: false });
        sendResponse({ ok: true, windowId: current.id });
      } else if (msg && msg.type === "getStorage") {
        const data = await getStorage();
        sendResponse({ ok: true, data });
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

// Clean up closed windows from storage
chrome.windows.onRemoved.addListener(async (windowId) => {
  await deleteWindow(windowId);
});
