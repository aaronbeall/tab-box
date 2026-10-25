import type { StorageData, StorageGroup, StorageTab, SyncExclusions } from './types'

export const DEFAULT_EXCLUSIONS: SyncExclusions = {
  tabs: ['Claude', 'Claude in Chrome*', 'chrome-extension://fcoeoabgfenejglbffodgkkbkcdhcgfn/*'],
  groups: ['Claude', 'Claude in Chrome*'],
  windows: ['Claude', 'Claude in Chrome*'],
}

export function validateExclusions(value: unknown): SyncExclusions {
  if (!value || typeof value !== 'object') throw new Error('Invalid exclusion rules.')
  const result = {} as SyncExclusions
  for (const field of ['tabs', 'groups', 'windows'] as const) {
    const rules = (value as Record<string, unknown>)[field]
    if (!Array.isArray(rules) || rules.length > 200 || rules.some(r => typeof r !== 'string' || r.length > 1000)) {
      throw new Error('Use up to 200 patterns per category, each at most 1,000 characters.')
    }
    result[field] = [...new Set((rules as string[]).map(r => r.trim()).filter(Boolean))]
  }
  return result
}

// Case-insensitive, whole-value glob matching. Only * and ? are special.
export function matchesPattern(value: string, pattern: string): boolean {
  const input = value.toLowerCase()
  const rule = pattern.toLowerCase()
  let i = 0, p = 0, star = -1, retry = 0
  while (i < input.length) {
    if (p < rule.length && (rule[p] === '?' || rule[p] === input[i])) { i++; p++ }
    else if (rule[p] === '*') { star = p++; retry = i }
    else if (star !== -1) { p = star + 1; i = ++retry }
    else return false
  }
  while (rule[p] === '*') p++
  return p === rule.length
}

export function matchesAny(rules: string[], ...values: string[]): boolean {
  return rules.some(rule => values.some(value => matchesPattern(value, rule)))
}

export function applyExclusions(data: StorageData, retainWindowNames = false): StorageData {
  const rules = data.exclusions ?? DEFAULT_EXCLUSIONS
  const windows: StorageData['windows'] = {}
  for (const [key, win] of Object.entries(data.windows)) {
    if (matchesAny(rules.windows, win.name ?? '')) {
      if (retainWindowNames) windows[key] = { ...win, groups: {} }
      continue
    }
    const groups: typeof win.groups = {}
    for (const [groupKey, group] of Object.entries(win.groups)) {
      if (matchesAny(rules.groups, group.title)) continue
      const tabs = group.tabs.filter(tab => !matchesAny(rules.tabs, tab.title, tab.url))
      // Don't retain an empty group after filtering its last tab.
      if (group.tabs.length && !tabs.length) continue
      groups[groupKey] = { ...group, tabs }
    }
    windows[key] = { ...win, groups }
  }
  return { windows, exclusions: rules }
}

const COLORS = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange']
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid backup structure.')
  return value as Record<string, unknown>
}
const string = (value: unknown): string => {
  if (typeof value !== 'string' || value.length > 100000) throw new Error('Invalid backup text.')
  return value
}
const bool = (value: unknown): boolean => {
  if (typeof value !== 'boolean') throw new Error('Invalid tab history state.')
  return value
}

export function createBackup(data: StorageData) {
  return { format: 'tabbox', version: 1, exportedAt: new Date().toISOString(), data: applyExclusions(data) }
}

// Add imported windows without trusting machine-specific Chrome IDs or arbitrary properties.
export function importBackup(current: StorageData, text: string, importRules = false): StorageData {
  if (text.length > 10 * 1024 * 1024) throw new Error('Backup must be smaller than 10 MB.')
  const backup = record(JSON.parse(text))
  if (backup.format !== 'tabbox' || backup.version !== 1) throw new Error('Unsupported Tab Box backup format or version.')
  const source = record(backup.data)
  const sourceWindows = record(source.windows)
  const exclusions = importRules ? validateExclusions(source.exclusions) : current.exclusions ?? DEFAULT_EXCLUSIONS
  const windows = { ...current.windows }
  let nextId = -2
  for (const w of Object.values(windows)) {
    nextId = Math.min(nextId, w.id - 1)
    for (const g of Object.values(w.groups)) {
      nextId = Math.min(nextId, g.id - 1)
      for (const tab of g.tabs) nextId = Math.min(nextId, tab.id - 1)
    }
  }
  let count = 0
  const id = () => { if (++count > 50000) throw new Error('Backup contains too many items.'); return nextId-- }
  for (const value of Object.values(sourceWindows)) {
    const win = record(value)
    const windowId = id()
    const groups: Record<string, StorageGroup> = {}
    for (const value of Object.values(record(win.groups))) {
      const group = record(value)
      if (!Array.isArray(group.tabs)) throw new Error('Invalid backup tabs.')
      if (group.color !== null && !COLORS.includes(group.color as string)) throw new Error('Invalid group color.')
      const groupId = id()
      const tabs: StorageTab[] = group.tabs.map(value => {
        const tab = record(value)
        const url = string(tab.url)
        // Reject executable URLs; allow Chrome pages and local files that tabs can normally contain.
        if (!/^(https?:|file:|ftp:|chrome:|chrome-extension:|about:)/i.test(url) && url !== '') {
          throw new Error('Backup contains an unsupported tab URL.')
        }
        return { id: id(), title: string(tab.title), url, closed: bool(tab.closed) }
      })
      groups[groupId] = {
        id: groupId, windowId, closed: true, title: string(group.title),
        color: group.color as StorageGroup['color'], tabs,
        collapsed: typeof group.collapsed === 'boolean' ? group.collapsed : true,
        position: typeof group.position === 'number' && Number.isFinite(group.position) ? group.position : 0,
      }
    }
    windows[windowId] = { id: windowId, closed: true, groups, ...(win.name === undefined ? {} : { name: string(win.name) }) }
  }
  return applyExclusions({ windows, exclusions }, true)
}
