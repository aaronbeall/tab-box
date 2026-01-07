import React, { useEffect, useMemo, useState } from 'react'
import { FiChevronRight, FiChevronDown } from 'react-icons/fi'
import { colorToCss, displayUrl, withAlpha, readableTextColor } from './utils'

type TabItem = { id: string | number; title: string; url: string }
type GroupItem = { id: number; title: string; color: string | null; tabs: TabItem[] }
type WindowItem = { id: number; title: string; groups: GroupItem[] }

async function buildModel(): Promise<WindowItem[]> {
  const response = await chrome.runtime.sendMessage({ type: 'getStorage' }).catch(() => ({ ok: false }))
  if (!response.ok || !response.data) return []
  const data = response.data
  const model: WindowItem[] = []
  for (const windowId in data.windows) {
    const w = data.windows[windowId]
    const groups: GroupItem[] = []
    for (const groupId in w.groups) {
      const g = w.groups[groupId]
      groups.push({
        id: g.id,
        title: g.title || '',
        color: g.color || null,
        tabs: g.tabs || []
      })
    }
    model.push({
      id: w.id,
      title: w.title || `Window ${w.id}`,
      groups
    })
  }
  return model
}

export default function App() {
  const [model, setModel] = useState<WindowItem[]>([])
  const [search, setSearch] = useState('')
  const [focusedWindowId, setFocusedWindowId] = useState<number | null>(null)
  const [expandedWindows, setExpandedWindows] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const load = async () => {
      const m = await buildModel()
      setModel(m)
      const r = await chrome.runtime.sendMessage({ type: 'getFocusedWindowId' }).catch(() => ({ windowId: null }))
      setFocusedWindowId(r?.windowId ?? null)
      if (r?.windowId) {
        setExpandedWindows((prev) => {
          const key = String(r.windowId)
          return prev[key] !== undefined ? prev : { ...prev, [key]: true }
        })
      }
    }
    load()
    const listener = (msg: any) => {
      if (msg && (msg.type === 'storageChanged' || msg.type === 'windowFocused')) {
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
      const wg = w.groups.filter((g) => (g.title || '').toLowerCase().includes(q) || g.tabs.some((t) => (t.title || '').toLowerCase().includes(q) || (t.url || '').toLowerCase().includes(q)))
      const matchWindow = (w.title || '').toLowerCase().includes(q)
      return matchWindow || wg.length ? { ...w, groups: wg } : null
    }).filter(Boolean) as WindowItem[]
  }, [q, model])

  // Order: current window at top, then by title; filter out empty windows
  const ordered = useMemo(() => {
    const list = filtered.filter((w) => w.groups.length > 0)
    list.sort((a, b) => {
      const aIsCurrent = a.id === focusedWindowId
      const bIsCurrent = b.id === focusedWindowId
      if (aIsCurrent && !bIsCurrent) return -1
      if (bIsCurrent && !aIsCurrent) return 1
      return (a.title || '').localeCompare(b.title || '')
    })
    return list
  }, [filtered, focusedWindowId])

  const toggleWindow = (id: string) => setExpandedWindows((prev) => ({ ...prev, [id]: !prev[id] }))

  const onWindowClick = async (w: WindowItem) => {
    await chrome.runtime.sendMessage({ type: 'focusWindow', windowId: w.id })
  }

  const onGroupClick = async (g: GroupItem) => {
    await chrome.runtime.sendMessage({ type: 'openGroup', groupId: g.id })
  }

  const onTabClick = async (t: TabItem) => {
    await chrome.runtime.sendMessage({ type: 'openTab', url: t.url })
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
      </header>
      <main className="p-2 overflow-auto">
        <div className="space-y-2 text-sm">
          {ordered.map((w) => {
            const expanded = !!expandedWindows[String(w.id)]
            return (
              <div key={w.id} className="border border-gray-200 dark:border-zinc-800 rounded-md">
                <div className="flex items-center gap-2 font-semibold cursor-pointer select-none px-2 py-1 rounded-md hover:bg-gray-50 dark:hover:bg-zinc-800/60" onClick={() => onWindowClick(w)}>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleWindow(String(w.id)) }}
                    className="w-5 h-5 border border-gray-400 dark:border-zinc-600 rounded text-xs text-gray-600 dark:text-gray-300 grid place-items-center bg-white dark:bg-zinc-900">
                    {expanded ? <FiChevronDown size={12} /> : <FiChevronRight size={12} />}
                  </button>
                  <span className="truncate">{w.title}</span>
                </div>
                {expanded && (
                  <div className="mt-1 px-2 pb-2 space-y-2">
                    {w.groups.length === 0 && (
                      <div className="text-gray-500 dark:text-gray-400 italic px-1 py-2">No tab groups saved for this window.</div>
                    )}
                    {w.groups.map((g) => {
                      const base = colorToCss(g.color)
                      const headerBg = withAlpha(base, 0.18)
                      const borderCol = withAlpha(base, 0.35)
                      const tagText = readableTextColor(base)
                      return (
                        <div key={g.id} className="rounded-md border" style={{ borderColor: borderCol }}>
                          <div className="px-2 py-1 rounded-t-md border-b" style={{ background: headerBg, borderColor: borderCol }}>
                            <div
                              className="inline-flex items-center cursor-pointer"
                              onClick={() => onGroupClick(g)}
                            >
                              <span
                                className="inline-flex items-center justify-center rounded-md px-2 py-0.5 text-xs font-semibold min-w-[1.5rem] min-h-[1.5rem]"
                                style={{ background: base, color: tagText }}
                              >
                                {g.title}
                              </span>
                            </div>
                          </div>
                          <div className="divide-y divide-gray-200 dark:divide-zinc-800">
                            {g.tabs.map((t) => (
                              <div
                                key={t.id}
                                className="flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-800/60"
                                onClick={() => onTabClick(t)}
                                title={`${t.title || ''} (${displayUrl(t.url)})`}
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
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
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
