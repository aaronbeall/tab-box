import React, { useEffect, useMemo, useState } from 'react'
import { FiChevronRight, FiChevronDown, FiX, FiTrash2, FiInfo } from 'react-icons/fi'
import { colorToCss, displayUrl, withAlpha, readableTextColor } from './utils'
import type { TabItem, GroupItem, WindowItem, StorageData } from './types'

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
      title: w.title || '',
      groups
    })
  }
  return model
}

export default function App() {
  const [model, setModel] = useState<WindowItem[]>([])
  const [search, setSearch] = useState('')
  const [currentWindowId, setCurrentWindowId] = useState<number | undefined>(undefined)
  const [expandedWindows, setExpandedWindows] = useState<Record<string, boolean>>({})
  const [searchClosedTabs, setSearchClosedTabs] = useState(false)
  const [expandedClosedTabs, setExpandedClosedTabs] = useState<Record<string, boolean>>({})
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
      const wg = w.groups.filter((g) => {
        const groupMatches = (g.title || '').toLowerCase().includes(q)
        const openTabsMatch = g.tabs.filter(t => t.id !== null).some((t) => (t.title || '').toLowerCase().includes(q) || (t.url || '').toLowerCase().includes(q))
        const closedTabsMatch = searchClosedTabs && g.tabs.filter(t => t.id === null).some((t) => (t.title || '').toLowerCase().includes(q) || (t.url || '').toLowerCase().includes(q))
        return groupMatches || openTabsMatch || closedTabsMatch
      })
      const matchWindow = (w.title || '').toLowerCase().includes(q)
      return matchWindow || wg.length ? { ...w, groups: wg } : null
    }).filter(Boolean) as WindowItem[]
  }, [q, model, searchClosedTabs])

  // Order: current window at top, then by title; filter out empty windows
  const ordered = useMemo(() => {
    const list = filtered.filter((w) => w.groups.length > 0)
    list.sort((a, b) => {
      const aIsCurrent = a.id === currentWindowId
      const bIsCurrent = b.id === currentWindowId
      if (aIsCurrent && !bIsCurrent) return -1
      if (bIsCurrent && !aIsCurrent) return 1
      return (a.title || '').localeCompare(b.title || '')
    })
    // Sort groups within each window: open groups first, then closed groups
    return list.map(w => ({
      ...w,
      groups: [...w.groups].sort((a, b) => {
        const aIsOpen = a.id !== null
        const bIsOpen = b.id !== null
        if (aIsOpen && !bIsOpen) return -1
        if (bIsOpen && !aIsOpen) return 1
        return 0
      })
    }))
  }, [filtered, currentWindowId])

  const toggleWindow = (key: string) => setExpandedWindows((prev) => ({ ...prev, [key]: !prev[key] }))

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

  const onDeleteTab = async (e: React.MouseEvent, w: WindowItem, g: GroupItem, tabId: number | null) => {
    e.stopPropagation()
    if (!confirm('Delete this tab permanently?')) return
    await chrome.runtime.sendMessage({ type: 'deleteTab', windowKey: w.key, groupKey: g.key, tabId })
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
          <div className="mt-2 flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer select-none">
              <div className="relative inline-flex w-10 h-5 bg-gray-300 dark:bg-gray-700 rounded-full transition-colors" style={{ backgroundColor: searchClosedTabs ? '#3b82f6' : undefined }}>
                <input
                  type="checkbox"
                  checked={searchClosedTabs}
                  onChange={(e) => setSearchClosedTabs(e.target.checked)}
                  className="sr-only"
                />
                <span className={`absolute top-0.5 left-0.5 inline-block w-4 h-4 bg-white rounded-full transition-transform ${searchClosedTabs ? 'translate-x-5' : ''}`} />
              </div>
              <span>Include closed tabs</span>
            </label>
          </div>
        )}
        {duplicateGroupNames.length > 0 && (
          <div className="mt-2 flex gap-2 p-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 rounded text-xs text-blue-800 dark:text-blue-200">
            <FiInfo size={14} className="shrink-0 mt-0.5" />
            <span>Duplicate group names detected: <strong>{duplicateGroupNames.join(', ')}</strong>. Unique names help with reliable restoration after Chrome restart.</span>
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
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 pt-2 select-none">
                    <div className="h-px flex-1 bg-gray-200 dark:bg-zinc-800" />
                    <div
                      onClick={() => setExpandedClosedWindows(!expandedClosedWindows)}
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-800/60"
                    >
                      {expandedClosedWindows ? <FiChevronDown size={12} /> : <FiChevronRight size={12} />}
                      <span className="font-semibold">Closed Windows ({ordered.filter(w => w.id === null).length})</span>
                    </div>
                    <div className="h-px flex-1 bg-gray-200 dark:bg-zinc-800" />
                  </div>
                )}
                {(!isClosed || expandedClosedWindows) && (
                  <div className={`border border-gray-200 dark:border-zinc-800 rounded-md ${isClosed ? 'opacity-50 bg-gray-50 dark:bg-zinc-900/30' : ''}`}>
                    <div className="flex items-start justify-between cursor-pointer select-none px-2 py-1 rounded-md hover:bg-gray-50 dark:hover:bg-zinc-800/60" onClick={() => onWindowClick(w)}>
                      <div className="flex items-start gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleWindow(w.key) }}
                          className="mt-0.5 w-5 h-5 border border-gray-400 dark:border-zinc-600 rounded text-xs text-gray-600 dark:text-gray-300 grid place-items-center shrink-0 bg-white dark:bg-zinc-900">
                          {expanded ? <FiChevronDown size={12} /> : <FiChevronRight size={12} />}
                        </button>
                        {expanded ? (
                          <span className="font-semibold mt-0.5">{w.groups.length} {w.groups.length === 1 ? 'group' : 'groups'}</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5 min-w-0">
                            {w.groups.map((g) => {
                              const base = colorToCss(g.color)
                              const tagText = readableTextColor(base)
                              const isGroupClosed = !isClosed && g.id === null
                              return (
                                <span
                                  key={g.key}
                                  className={`inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[11px] font-semibold min-w-[1.25rem] min-h-[1.25rem] cursor-pointer hover:opacity-80 ${isGroupClosed ? 'opacity-50' : ''}`}
                                  style={{ background: base, color: tagText }}
                                  onClick={(e) => { e.stopPropagation(); onGroupClick(g, w) }}
                                >
                                  {g.title}
                                </span>
                              )
                            })}
                          </div>
                        )}
                      </div>
                      {isClosed && (
                        <button
                          onClick={(e) => onDeleteWindow(e, w)}
                          className="mt-0.5 w-5 h-5 text-gray-600 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 flex items-center justify-center shrink-0">
                          <FiTrash2 size={16} />
                        </button>
                      )}
                    </div>
                    {expanded && (
                      <div className="border-t border-gray-200 dark:border-zinc-800">
                        {w.groups.map((g) => {
                          const base = colorToCss(g.color)
                          const headerBg = withAlpha(base, 0.18)
                          const borderCol = withAlpha(base, 0.35)
                          const tagText = readableTextColor(base)
                          const isGroupClosedInOpenWindow = !isClosed && g.id === null
                          return (
                            <div key={g.key} className={`rounded-md border ${isGroupClosedInOpenWindow ? 'opacity-50' : ''}`} style={{ borderColor: borderCol }}>
                              <div className="flex items-center justify-between px-2 py-1 rounded-t-md border-b" style={{ background: headerBg, borderColor: borderCol }}>
                                <div
                                  className="inline-flex items-center cursor-pointer flex-1"
                                  onClick={() => onGroupClick(g, w)}
                                >
                                  <span
                                    className="inline-flex items-center justify-center rounded-md px-2 py-0.5 text-xs font-semibold min-w-[1.5rem] min-h-[1.5rem]"
                                    style={{ background: base, color: tagText }}
                                  >
                                    {g.title}
                                  </span>
                                </div>
                                {g.id !== null ? (
                                  <button
                                    onClick={(e) => onCloseGroup(e, g.id!)}
                                    className="w-5 h-5 text-gray-600 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 flex items-center justify-center shrink-0 -mr-1"
                                    title="Close group"
                                  >
                                    <FiX size={16} />
                                  </button>
                                ) : (
                                  <button
                                    onClick={(e) => onDeleteGroup(e, w, g)}
                                    className="w-5 h-5 text-gray-600 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 flex items-center justify-center shrink-0 -mr-1"
                                    title="Delete group"
                                  >
                                    <FiTrash2 size={16} />
                                  </button>
                                )}
                              </div>
                              {(() => {
                                const openTabs = g.tabs.filter(t => t.id !== null)
                                const closedTabs = g.tabs.filter(t => t.id === null)
                                return (
                                  <>
                                    <div className="divide-y divide-gray-200 dark:divide-zinc-800">
                                      {openTabs.map((t) => (
                                        <div
                                          key={t.id}
                                          className="flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-800/60 group"
                                          onClick={() => onTabClick(t, g, w)}
                                          title={`${t.title || ''} | ${t.url}`}
                                        >
                                          <img
                                            src={`chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(t.url)}&size=16`}
                                            alt=""
                                            className="w-4 h-4 rounded-sm shrink-0"
                                            referrerPolicy="no-referrer"
                                          />
                                          <span className="min-w-0 flex-1 truncate">{t.title}</span>
                                        </div>
                                      ))}
                                    </div>
                                    {closedTabs.length > 0 && (
                                      <div className="border-t border-gray-200 dark:border-zinc-800">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            const key = `${g.key}-history`
                                            setExpandedClosedTabs(prev => ({ ...prev, [key]: !prev[key] }))
                                          }}
                                          className="w-full flex items-center gap-1.5 px-2 py-1 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-zinc-800/60"
                                        >
                                          {expandedClosedTabs[`${g.key}-history`] ? <FiChevronDown size={12} /> : <FiChevronRight size={12} />}
                                          <span>History ({closedTabs.length})</span>
                                        </button>
                                        {expandedClosedTabs[`${g.key}-history`] && (
                                          <div className="divide-y divide-gray-200 dark:divide-zinc-800 bg-gray-50 dark:bg-zinc-900/30">
                                            {closedTabs.map((t) => (
                                              <div
                                                key={`closed-${t.url}`}
                                                className="flex items-center gap-2 px-2 py-1 opacity-60 group cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-800/40 hover:opacity-100 transition-all"
                                                onClick={() => onTabClick(t, g, w)}
                                                title={`${t.title || ''} | ${t.url}`}
                                              >
                                                <img
                                                  src={`chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(t.url)}&size=16`}
                                                  alt=""
                                                  className="w-4 h-4 rounded-sm shrink-0"
                                                  referrerPolicy="no-referrer"
                                                />
                                                <span className="min-w-0 flex-1 truncate">{t.title}</span>
                                                <button
                                                  onClick={(e) => onDeleteTab(e, w, g, t.id)}
                                                  className="w-4 h-4 text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 flex items-center justify-center shrink-0 opacity-0 group-hover:opacity-100"
                                                  title="Delete tab"
                                                >
                                                  <FiTrash2 size={12} />
                                                </button>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </>
                                )
                              })()}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
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
