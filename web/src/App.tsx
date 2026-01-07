import React, { useEffect, useMemo, useState } from 'react'
import { FiChevronRight, FiChevronDown } from 'react-icons/fi'
import { colorToCss, displayUrl, withAlpha, readableTextColor } from './utils'

const ROOT_FOLDER_TITLE = 'Tab Box'
const META_BOOKMARK_URL = 'tabbox:meta'

type TabItem = { id: string; title: string; url: string }
type GroupItem = { id: string; title: string; color: string | null; groupId: number | null; tabs: TabItem[] }
type WindowItem = { id: string; title: string; windowId: number | null; groups: GroupItem[] }

async function getRootFolder(): Promise<chrome.bookmarks.BookmarkTreeNode | null> {
  const tree = await chrome.bookmarks.getTree()
  const stack = [...tree]
  while (stack.length) {
    const node = stack.pop()!
    if (!node.url && node.title === ROOT_FOLDER_TITLE) return node
    if (node.children) stack.push(...node.children)
  }
  return null
}

async function buildModel(): Promise<WindowItem[]> {
  const root = await getRootFolder()
  if (!root) return []
  const windows = await chrome.bookmarks.getChildren(root.id)
  const model: WindowItem[] = []
  for (const w of windows) {
    if (w.url) continue
    const children = await chrome.bookmarks.getChildren(w.id)
    // Read window metadata first
    const windowMeta = children.find((x) => x.url === META_BOOKMARK_URL)
    let windowData: { windowId?: number; title?: string } = {}
    if (windowMeta) {
      try { windowData = JSON.parse(windowMeta.title) } catch { }
    }
    const windowId = windowData.windowId || parseInt((w.title || '').replace(/[^0-9]/g, ''), 10) || null
    const windowTitle = windowData.title || w.title || ""

    const groups: GroupItem[] = []
    for (const c of children) {
      if (c.url) continue
      const cc = await chrome.bookmarks.getChildren(c.id)
      const meta = cc.find((x) => x.url === META_BOOKMARK_URL)
      let data: Partial<GroupItem & { windowId?: number | null }> = { title: c.title, color: null, groupId: null }
      if (meta) {
        try { data = { ...data, ...JSON.parse(meta.title) } } catch { }
      }
      const tabs: TabItem[] = cc.filter((x) => x.url && x.url !== META_BOOKMARK_URL).map((x) => ({ id: x.id, title: x.title || x.url!, url: x.url! }))
      groups.push({ id: c.id, title: data.title || c.title || '', color: (data.color as any) || null, groupId: (data.groupId as any) || null, tabs })
    }
    model.push({ id: w.id, title: windowTitle, windowId, groups })
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
      if (r?.windowId) setExpandedWindows((prev) => ({ ...prev, [String(r.windowId)]: true }))
    }
    load()
    const listener = (msg: any) => {
      if (msg && (msg.type === 'bookmarksChanged' || msg.type === 'windowFocused')) {
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
      const aIsCurrent = a.windowId != null && a.windowId === focusedWindowId
      const bIsCurrent = b.windowId != null && b.windowId === focusedWindowId
      if (aIsCurrent && !bIsCurrent) return -1
      if (bIsCurrent && !aIsCurrent) return 1
      return (a.title || '').localeCompare(b.title || '')
    })
    return list
  }, [filtered, focusedWindowId])

  const toggleWindow = (id: string) => setExpandedWindows((prev) => ({ ...prev, [id]: !prev[id] }))

  const onWindowClick = async (w: WindowItem) => {
    if (w.windowId) {
      await chrome.runtime.sendMessage({ type: 'focusWindow', windowId: w.windowId })
    } else {
      await chrome.runtime.sendMessage({ type: 'focusWindowFolder', folderId: w.id })
    }
  }

  const onGroupClick = async (g: GroupItem) => {
    await chrome.runtime.sendMessage({ type: 'openGroupFolder', folderId: g.id })
  }

  const onTabClick = async (t: TabItem) => {
    await chrome.runtime.sendMessage({ type: 'openTabBookmark', bookmarkId: t.id })
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
            const expanded = !!expandedWindows[String(w.windowId ?? w.id)]
            return (
              <div key={w.id} className="border border-gray-200 dark:border-zinc-800 rounded-md">
                <div className="flex items-center gap-2 font-semibold cursor-pointer select-none px-2 py-1 rounded-md hover:bg-gray-50 dark:hover:bg-zinc-800/60" onClick={() => onWindowClick(w)}>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleWindow(String(w.windowId ?? w.id)) }}
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
