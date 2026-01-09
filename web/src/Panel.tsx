import React, { useEffect, useMemo, useState } from 'react'
import { FiInfo } from 'react-icons/fi'
import { EditableName } from './components/EditableName'
import { Switch } from './components/Switch';
import { CollapsableHeader } from './components/CollapsableHeader';
import { WindowItemView } from './components/WindowItemView';
import { GroupItemView } from './components/GroupItemView';
import type { GroupItem, StorageData, TabItem, WindowItem } from './types'

async function buildModel(): Promise<WindowItem[]> {
  const response = await chrome.runtime.sendMessage({ type: 'getStorage' }).catch(() => ({ ok: false }))
  if (!response.ok || !response.data) return []
  const data = response.data as StorageData;
  const model: WindowItem[] = []
  for (const windowKey in data.windows) {
    const w = data.windows[windowKey]
    const groups: GroupItem[] = []
    for (const groupKey in w.groups) {
      const g = w.groups[groupKey]
      groups.push({
        ...g,
        key: groupKey
      });
    }
    model.push({
      id: w.id,
      key: windowKey,
      name: w.name,
      groups
    })
  }
  return model
}

export default function Panel() {
  const [model, setModel] = useState<WindowItem[]>([])
  const [search, setSearch] = useState('')
  const [currentWindowId, setCurrentWindowId] = useState<number | undefined>(undefined)
  const [expandedWindows, setExpandedWindows] = useState<Record<string, boolean>>({})
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  const [searchAllWindows, setSearchAllWindows] = useState(true)
  const [searchClosedTabs, setSearchClosedTabs] = useState(false)
  const [expandedClosedWindows, setExpandedClosedWindows] = useState(false)

  useEffect(() => {
    const load = async () => {
      const m = await buildModel()
      setModel(m)
      const currentWindow = await chrome.windows.getCurrent()
      setCurrentWindowId(currentWindow.id)
      if (currentWindow.id) {
        setExpandedWindows((prev) => {
          const key = String(currentWindow.id)
          return prev[key] !== undefined ? prev : { ...prev, [key]: true }
        })
      }
    }
    load()
    const listener = (msg: any) => {
      if (msg && msg.type === 'storageChanged') {
        load()
      }
    }
    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [])

  const q = search.toLowerCase().trim()
  const filtered = useMemo(() => {
    if (!q) return model
    return model.map((w) => {
      // Filter windows if searchAllWindows is false - only include current window
      if (!searchAllWindows && w.id !== currentWindowId) {
        return null
      }

      const wg = w.groups.filter((g) => {
        const groupMatches = (g.title || '').toLowerCase().includes(q)
        const openTabsMatch = g.tabs.filter(t => t.id !== null).some((t) => (t.title || '').toLowerCase().includes(q) || (t.url || '').toLowerCase().includes(q))
        const closedTabsMatch = searchClosedTabs && g.tabs.filter(t => t.id === null).some((t) => (t.title || '').toLowerCase().includes(q) || (t.url || '').toLowerCase().includes(q))
        return groupMatches || openTabsMatch || closedTabsMatch
      })
      const matchWindow = (w.name || '').toLowerCase().includes(q)
      return matchWindow || wg.length ? { ...w, groups: wg } : null
    }).filter(Boolean) as WindowItem[]
  }, [q, model, searchAllWindows, searchClosedTabs])

  // Order: current window at top, then open windows, then closed windows; filter out empty windows
  const ordered = useMemo(() => {
    const list = filtered.filter((w) => w.groups.length > 0)
    list.sort((a, b) => {
      const aIsCurrent = a.id === currentWindowId
      const bIsCurrent = b.id === currentWindowId
      if (aIsCurrent && !bIsCurrent) return -1
      if (bIsCurrent && !aIsCurrent) return 1

      // Then sort by open/closed status
      const aIsOpen = a.id !== null
      const bIsOpen = b.id !== null
      if (aIsOpen && !bIsOpen) return -1
      if (bIsOpen && !aIsOpen) return 1

      // Finally sort by name
      return (a.name || '').localeCompare(b.name || '')
    })
    // Sort groups within each window: open groups first, then closed groups
    return list.map(w => ({
      ...w,
      groups: [...w.groups].sort((a, b) => {
        const aIsOpen = a.id !== null
        const bIsOpen = b.id !== null
        if (aIsOpen && !bIsOpen) return -1
        if (bIsOpen && !aIsOpen) return 1
        const posA = a.position ?? Number.MAX_SAFE_INTEGER
        const posB = b.position ?? Number.MAX_SAFE_INTEGER
        if (posA !== posB) return posA - posB
        return (a.title || '').localeCompare(b.title || '')
      })
    }))
  }, [filtered, currentWindowId])

  const toggleWindow = (key: string) => {
    setExpandedWindows((prev) => ({ ...prev, [key]: !prev[key] }))
    // Clear group expanded overrides when collapsing window
    if (expandedWindows[key]) {
      setExpandedGroups((prev) => {
        const next = { ...prev }
        for (const g of model.find(w => w.key === key)?.groups || []) {
          delete next[g.key]
        }
        return next
      })
    }
  }

  const toggleGroup = (key: string, expanded: boolean) => setExpandedGroups((prev) => ({ ...prev, [key]: expanded }))

  // Detect duplicate group names
  const duplicateGroupNames = useMemo(() => {
    const titles = new Map<string, number>()
    for (const w of ordered) {
      for (const g of w.groups) {
        const count = titles.get(g.title) || 0
        titles.set(g.title, count + 1)
      }
    }
    return Array.from(titles.entries())
      .filter(([, count]) => count > 1)
      .map(([title]) => title)
  }, [ordered])

  const onWindowClick = async (w: WindowItem) => {
    await chrome.runtime.sendMessage({ type: 'openWindow', window: w })
  }

  const onGroupClick = async (g: GroupItem, w: WindowItem) => {
    // If group was explicitly collapsed by user, expand it in panel
    if (expandedGroups[g.key] === false) {
      setExpandedGroups(prev => ({ ...prev, [g.key]: true }))
    }
    await chrome.runtime.sendMessage({ type: 'openGroup', group: g, window: w })
  }

  const onTabClick = async (t: TabItem, g: GroupItem, w: WindowItem) => {
    await chrome.runtime.sendMessage({ type: 'openTab', tab: t, group: g, window: w })
  }

  const onCloseGroup = async (e: React.MouseEvent, groupId: number) => {
    e.stopPropagation()
    if (!confirm('Close this tab group?')) return
    await chrome.runtime.sendMessage({ type: 'closeGroup', groupId })
  }

  const onDeleteGroup = async (e: React.MouseEvent, w: WindowItem, g: GroupItem) => {
    e.stopPropagation()
    if (!confirm('Delete this group and all its data?')) return
    await chrome.runtime.sendMessage({ type: 'deleteGroup', windowKey: w.key, groupKey: g.key })
  }

  const onDeleteWindow = async (e: React.MouseEvent, w: WindowItem) => {
    e.stopPropagation()
    if (!confirm('Delete this window and all its groups?')) return
    await chrome.runtime.sendMessage({ type: 'deleteWindow', windowKey: w.key })
  }

  const onDeleteTab = async (e: React.MouseEvent, w: WindowItem, g: GroupItem, tabId: number | null, tabUrl?: string) => {
    e.stopPropagation()
    if (!confirm('Delete this tab permanently?')) return
    await chrome.runtime.sendMessage({ type: 'deleteTab', windowKey: w.key, groupKey: g.key, tabId, tabUrl })
  }

  const onDeleteClosedTabs = async (e: React.MouseEvent, w: WindowItem, g: GroupItem) => {
    e.stopPropagation()
    if (!confirm('Delete all closed tabs in this group?')) return
    await chrome.runtime.sendMessage({ type: 'deleteClosedTabs', windowKey: w.key, groupKey: g.key })
  }

  const onEditWindowName = async (w: WindowItem) => {
    const value = prompt('Window name (optional):', w.name || '')
    if (value === null) return
    const name = value.trim()
    await chrome.runtime.sendMessage({ type: 'setWindowName', windowKey: w.key, name })
  }

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-zinc-900 text-gray-900 dark:text-gray-100">
      <header className="p-2 border-b border-gray-200 dark:border-zinc-800">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-2 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 placeholder-gray-500 dark:placeholder-gray-400"
          placeholder="Search windows, groups, tabs"
          type="search"
        />
        {q && (
          <div className="mt-2 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Switch
                checked={searchAllWindows}
                onChange={(e) => setSearchAllWindows(e.target.checked)}
                label="All Windows"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={searchClosedTabs}
                onChange={(e) => setSearchClosedTabs(e.target.checked)}
                label="Closed Tabs"
              />
            </div>
          </div>
        )}
        {duplicateGroupNames.length > 0 && (
          <div className="mt-2 flex gap-2 p-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 rounded text-xs text-blue-800 dark:text-blue-200">
            <FiInfo size={14} className="shrink-0 mt-0.5" />
            <span>Duplicate group names detected: <strong>{duplicateGroupNames.join(', ')}</strong>. Unique names help with reliable restoration across sessions.</span>
          </div>
        )}
      </header>
      <main className="p-2 overflow-auto">
        <div className="space-y-2 text-sm">
          {ordered.map((w, idx) => {
            const expanded = !!expandedWindows[w.key]
            const isClosed = w.id === null
            const isFirstClosed = isClosed && (idx === 0 || ordered[idx - 1].id !== null)

            return (
              <React.Fragment key={w.key}>
                {isFirstClosed && (
                  <CollapsableHeader
                    title="Closed Windows"
                    isOpen={expandedClosedWindows}
                    onToggle={() => setExpandedClosedWindows(!expandedClosedWindows)}
                    count={ordered.filter(w => w.id === null).length}
                  />
                )}
                {(!isClosed || expandedClosedWindows) && (
                  <WindowItemView
                    window={w}
                    isExpanded={expanded}
                    onToggleExpand={toggleWindow}
                    onWindowClick={onWindowClick}
                    onGroupClick={onGroupClick}
                    onDeleteWindow={onDeleteWindow}
                    onEditWindowName={onEditWindowName}
                  >
                    {w.groups.map((g) => {
                      // Group is expanded if: explicitly toggled to open OR (not explicitly toggled AND not collapsed in storage AND not closed)
                      const isGroupExpanded = expandedGroups[g.key] !== undefined
                        ? expandedGroups[g.key]
                        : g.id != null && !(g.collapsed ?? true)

                      return (
                        <GroupItemView
                          key={g.key}
                          group={g}
                          window={w}
                          isWindowClosed={isClosed}
                          isGroupExpanded={isGroupExpanded}
                          onToggleGroup={(expanded) => toggleGroup(g.key, expanded)}
                          onGroupClick={onGroupClick}
                          onTabClick={onTabClick}
                          onCloseGroup={onCloseGroup}
                          onDeleteGroup={onDeleteGroup}
                          onDeleteTab={onDeleteTab}
                          onDeleteClosedTabs={onDeleteClosedTabs}
                        />
                      );
                    })}
                  </WindowItemView>
                )}
              </React.Fragment>
            )
          })}
          {!filtered.length && (
            <div className="text-gray-500 dark:text-gray-400">No items found.</div>
          )}
        </div>
      </main>
    </div>
  )
}