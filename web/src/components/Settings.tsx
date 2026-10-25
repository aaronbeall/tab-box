import React, { useEffect, useRef, useState } from 'react'
import { MdAdd, MdArrowBack, MdCheckCircle, MdClose, MdDownload, MdErrorOutline, MdFileUpload, MdOutlineFolder, MdRestore, MdShield } from 'react-icons/md'
import { DEFAULT_EXCLUSIONS, validateExclusions } from '../data'
import type { SyncExclusions } from '../types'

type Category = keyof SyncExclusions
type Notice = { text: string; error?: boolean }
type PendingImport = { name: string; text: string; windows: number; groups: number; tabs: number }
const CATEGORIES: { key: Category; label: string; description: string; placeholder: string }[] = [
  { key: 'tabs', label: 'Tabs', description: 'Match a tab’s title or URL.', placeholder: 'e.g. https://example.com/*' },
  { key: 'groups', label: 'Groups', description: 'Match a group name to skip the entire group.', placeholder: 'e.g. Claude*' },
  { key: 'windows', label: 'Windows', description: 'Match a window name you’ve assigned in Tab Box.', placeholder: 'e.g. *private*' },
]
const button = 'inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40 disabled:cursor-not-allowed'
const primary = `${button} bg-blue-600 text-white hover:bg-blue-700`
const secondary = `${button} border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-gray-50 dark:hover:bg-zinc-800`
const iconButton = 'grid h-8 w-8 shrink-0 place-items-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40'

async function request(message: object) {
  const response = await chrome.runtime.sendMessage(message)
  if (!response?.ok) throw new Error(response?.error || 'Tab Box could not complete the request.')
  return response
}

export function Settings({ onClose }: { onClose: () => void }) {
  const [section, setSection] = useState<'exclusions' | 'backups'>('exclusions')
  const [category, setCategory] = useState<Category>('tabs')
  const [rules, setRules] = useState<SyncExclusions>({ tabs: [], groups: [], windows: [] })
  const [savedRules, setSavedRules] = useState<SyncExclusions>(rules)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null)
  const [importRules, setImportRules] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const backButton = useRef<HTMLButtonElement>(null)
  const newPattern = useRef<HTMLInputElement>(null)
  const [focusNewPattern, setFocusNewPattern] = useState(false)
  const dirty = JSON.stringify(rules) !== JSON.stringify(savedRules)
  const activeCategory = CATEGORIES.find(item => item.key === category)!

  useEffect(() => {
    backButton.current?.focus()
    request({ type: 'getStorage' }).then(response => {
      const initial = response.data.exclusions ?? DEFAULT_EXCLUSIONS
      setRules(initial)
      setSavedRules(initial)
      setReady(true)
    }).catch(error => setNotice({ text: String(error), error: true }))
  }, [])

  useEffect(() => {
    if (focusNewPattern) { newPattern.current?.focus(); setFocusNewPattern(false) }
  }, [rules, focusNewPattern])

  const close = () => {
    if (busy) return
    if (dirty && !confirm('Discard unsaved exclusion changes?')) return
    onClose()
  }

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setNotice(null)
    try { await action() } catch (error) { setNotice({ text: error instanceof Error ? error.message : String(error), error: true }) } finally { setBusy(false) }
  }

  const save = () => run(async () => {
    const exclusions = validateExclusions(rules)
    await request({ type: 'setExclusions', exclusions })
    setRules(exclusions)
    setSavedRules(exclusions)
    setNotice({ text: 'Exclusions saved.' })
  })

  const exportData = () => run(async () => {
    const response = await request({ type: 'exportBackup' })
    const url = URL.createObjectURL(new Blob([JSON.stringify(response.backup, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `tabbox-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
    setNotice({ text: 'Backup downloaded. It’s ready to transfer to another machine.' })
  })

  const chooseFile = (file: File) => run(async () => {
    setPendingImport(null)
    setImportRules(false)
    if (file.size > 10 * 1024 * 1024) throw new Error('Choose a backup smaller than 10 MB.')
    const text = await file.text()
    const backup = JSON.parse(text)
    if (backup?.format !== 'tabbox' || backup?.version !== 1 || !backup?.data?.windows || typeof backup.data.windows !== 'object' || Array.isArray(backup.data.windows)) throw new Error('This file isn’t a supported Tab Box backup.')
    // Full validation runs in the worker before any data is written.
    const windows = Object.values(backup.data.windows) as { groups: Record<string, { tabs: unknown[] }> }[]
    const groups = windows.flatMap(win => Object.values(win.groups))
    const tabs = groups.reduce((count, group) => count + group.tabs.length, 0)
    setPendingImport({ name: file.name, text, windows: windows.length, groups: groups.length, tabs })
  })

  const importData = () => run(async () => {
    if (!pendingImport) return
    if (dirty && !confirm('Importing will discard your unsaved exclusion edits. Continue?')) return
    await request({ type: 'importBackup', text: pendingImport.text, importRules })
    const updated = await request({ type: 'getStorage' })
    setRules(updated.data.exclusions)
    setSavedRules(updated.data.exclusions)
    setPendingImport(null)
    setImportRules(false)
    setNotice({ text: 'Backup imported. Find your groups under Closed Windows.' })
  })

  const editRule = (index: number, value: string) => {
    setNotice(null)
    setRules(prev => ({ ...prev, [category]: prev[category].map((rule, i) => i === index ? value : rule) }))
  }

  return (
    <div className="flex h-screen flex-col bg-gray-50 text-gray-900 dark:bg-zinc-950 dark:text-gray-100 text-sm">
      <header className="shrink-0 border-b border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex h-14 items-center gap-2 px-3">
          <button ref={backButton} onClick={close} disabled={busy} className={iconButton} aria-label="Back to tabs" title="Back to tabs"><MdArrowBack size={20} /></button>
          <h1 className="text-base font-semibold">Settings</h1>
        </div>
        <nav aria-label="Settings sections" className="flex gap-5 px-5">
          {(['exclusions', 'backups'] as const).map(item => (
            <button key={item} aria-pressed={section === item} onClick={() => { setSection(item); setNotice(null) }} className={`relative border-b-2 pb-3 pt-1 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${section === item ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400' : 'border-transparent text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'}`}>
              {item === 'exclusions' ? 'Exclusions' : 'Backups'}
              {item === 'exclusions' && dirty && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-blue-500 align-middle" aria-label="Unsaved changes" />}
            </button>
          ))}
        </nav>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto p-4 space-y-5">
        {notice && <div role={notice.error ? 'alert' : 'status'} className={`flex items-start gap-2 rounded-lg p-3 text-xs leading-relaxed ${notice.error ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300' : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'}`}>
          {notice.error ? <MdErrorOutline size={17} className="shrink-0 mt-0.5" /> : <MdCheckCircle size={17} className="shrink-0 mt-0.5" />}
          <span className="min-w-0 flex-1 break-words">{notice.text}</span>
          <button aria-label="Dismiss message" className="shrink-0 rounded focus-visible:ring-2 focus-visible:ring-current" onClick={() => setNotice(null)}><MdClose size={16} /></button>
        </div>}
        {!ready && <p role="status" className="text-gray-500">{notice?.error ? 'Couldn’t load settings. Go back and try again.' : 'Loading settings…'}</p>}
        {ready && section === 'exclusions' && <>
          <div>
            <h2 className="font-semibold text-base">Keep these out of Tab Box</h2>
            <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">Skip tabs, groups, or windows you don’t want saved. Your browser tabs stay open.</p>
          </div>
          <fieldset disabled={busy} className="min-w-0 space-y-4">
            <legend className="sr-only">Exclusion patterns</legend>
            <div className="flex rounded-lg bg-gray-200/60 dark:bg-zinc-800 p-1 gap-1" aria-label="Pattern categories">
              {CATEGORIES.map(item => <button key={item.key} aria-pressed={category === item.key} onClick={() => setCategory(item.key)} className={`flex-1 rounded-md py-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${category === item.key ? 'bg-white shadow-sm text-gray-900 dark:bg-zinc-700 dark:text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}>
                {item.label} <span className="ml-1 opacity-60">{rules[item.key].filter(rule => rule.trim()).length}</span>
              </button>)}
            </div>
            <div className="rounded-xl border border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 overflow-hidden">
              <div className="px-3 py-3 border-b border-gray-100 dark:border-zinc-800">
                <h3 className="font-medium text-sm">{activeCategory.label === 'Tabs' ? 'Excluded tabs' : activeCategory.label === 'Groups' ? 'Excluded groups' : 'Excluded windows'}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{activeCategory.description}</p>
              </div>
              <div className="p-3 space-y-2">
                {rules[category].length === 0 && <p className="py-4 text-center text-xs text-gray-400">No exclusions. All {activeCategory.label.toLowerCase()} are included.</p>}
                {rules[category].map((rule, index) => <div key={`${category}-${index}`} className="flex items-center gap-1">
                  <input ref={index === rules[category].length - 1 ? newPattern : undefined} aria-label={`${activeCategory.label} pattern ${index + 1}`} value={rule} onChange={event => editRule(index, event.target.value)} placeholder={activeCategory.placeholder} spellCheck={false} autoComplete="off" className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-xs font-mono dark:border-zinc-700 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <button aria-label={`Remove ${rule || 'empty pattern'}`} title="Remove pattern" className={iconButton} onClick={() => { setRules(prev => ({ ...prev, [category]: prev[category].filter((_, i) => i !== index) })); setNotice(null) }}><MdClose size={17} /></button>
                </div>)}
                <button onClick={() => { setRules(prev => ({ ...prev, [category]: [...prev[category], ''] })); setFocusNewPattern(true); setNotice(null) }} disabled={rules[category].length >= 200} className="inline-flex items-center gap-1.5 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"><MdAdd size={17} />Add pattern</button>
              </div>
            </div>
            <div className="text-xs leading-relaxed text-gray-500 dark:text-gray-400 px-1">
              Use <code className="font-mono text-gray-700 dark:text-gray-200">*</code> for any text, like <code className="font-mono text-gray-700 dark:text-gray-200">*private*</code>. Patterns ignore case.
              <details className="mt-2"><summary className="cursor-pointer hover:text-gray-900 dark:hover:text-gray-200">About matching & defaults</summary><p className="mt-2">Patterns match the whole name or URL; ? matches one character. Defaults skip Claude automation names and extension pages. Personal items with matching names are also skipped.</p></details>
            </div>
            <button className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" onClick={() => { setRules(structuredClone(DEFAULT_EXCLUSIONS)); setNotice(null) }}><MdRestore size={16} />Restore default patterns</button>
          </fieldset>
        </>}
        {ready && section === 'backups' && <>
          <div>
            <h2 className="font-semibold text-base">Take your tabs with you</h2>
            <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">Move your saved groups and history to another machine, or keep a copy for later.</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 p-4">
            <div className="flex items-center gap-2 mb-2"><MdDownload size={20} className="text-blue-500" /><h3 className="font-semibold">Export backup</h3></div>
            <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400 mb-4">Download your saved windows, groups, history, and exclusions in one file.</p>
            <button disabled={busy} className={`${secondary} w-full`} onClick={exportData}><MdDownload size={18} />Download backup</button>
            {dirty && <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Uses your saved exclusions. Save your edits first to include them.</p>}
          </div>
          <div className="rounded-xl border border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 p-4 space-y-3">
            <div className="flex items-center gap-2"><MdFileUpload size={20} className="text-blue-500" /><h3 className="font-semibold">Import backup</h3></div>
            <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">Add groups from a Tab Box backup. Your existing saved windows are kept.</p>
            <input ref={fileInput} aria-label="Choose Tab Box backup" disabled={busy} type="file" accept=".json,application/json" className="hidden" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void chooseFile(file) }} />
            {!pendingImport ? <>
              <button disabled={busy} className={`${secondary} w-full`} onClick={() => fileInput.current?.click()}><MdOutlineFolder size={18} />Choose backup file</button>
              <p className="text-center text-[11px] text-gray-400">Tab Box JSON · Up to 10 MB</p>
            </> : <>
              <div className="rounded-lg bg-gray-50 dark:bg-zinc-800 p-3">
                <div className="flex gap-2 items-start"><MdOutlineFolder size={18} className="shrink-0 text-blue-500" /><span className="min-w-0 flex-1 break-all text-xs font-medium">{pendingImport.name}</span><button disabled={busy} className="text-gray-400 rounded focus-visible:ring-2 focus-visible:ring-blue-500" aria-label="Remove selected backup" onClick={() => setPendingImport(null)}><MdClose size={16} /></button></div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                  {[['Windows', pendingImport.windows], ['Groups', pendingImport.groups], ['Tabs', pendingImport.tabs]].map(([label, value]) => <div key={label}><dd className="font-semibold text-base">{value}</dd><dt className="text-[11px] text-gray-500 dark:text-gray-400">{label}</dt></div>)}
                </dl>
              </div>
              <label className="flex items-start gap-2 text-xs leading-relaxed cursor-pointer"><input type="checkbox" checked={importRules} disabled={busy} onChange={event => setImportRules(event.target.checked)} className="mt-0.5 accent-blue-600" /><span>Use the backup’s exclusion rules</span></label>
              {importRules && <p className="text-xs text-amber-700 dark:text-amber-300">Replaces your rules and removes matching saved entries and history.</p>}
              <button disabled={busy} className={`${primary} w-full`} onClick={importData}><MdFileUpload size={18} />{busy ? 'Importing…' : 'Import backup'}</button>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">Added under Closed Windows. Tabs won’t open automatically. Importing again adds another copy.</p>
            </>}
          </div>
          <p className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400 leading-relaxed px-1"><MdShield size={17} className="shrink-0 mt-0.5" />Backups include browsing URLs. Keep the file somewhere you trust.</p>
        </>}
      </main>
      {ready && section === 'exclusions' && <footer className="shrink-0 border-t border-gray-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 space-y-3">
        {dirty && <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">Saving removes matching saved entries and history. <button disabled={busy} onClick={() => setSection('backups')} className="underline text-blue-600 dark:text-blue-400">Export a backup</button> to keep a copy.</p>}
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-gray-400">{busy ? 'Saving…' : dirty ? 'Unsaved changes' : 'All changes saved'}</span>
          <div className="flex gap-2"><button disabled={busy || !dirty} className={secondary} onClick={() => { setRules(savedRules); setNotice(null) }}>Cancel</button><button disabled={busy || !dirty} className={primary} onClick={save}>Save changes</button></div>
        </div>
      </footer>}
    </div>
  )
}
