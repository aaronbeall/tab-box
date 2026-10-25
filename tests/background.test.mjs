import { test } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { buildSync } from 'esbuild'

const source = buildSync({ entryPoints: ['background.ts'], bundle: true, write: false, format: 'iife', platform: 'browser' }).outputFiles[0].text
const event = () => ({ listeners: [], addListener(fn) { this.listeners.push(fn) } })
function worker() {
  let saved = { windows: {} }
  const groups = [{ id: 2, windowId: 1, title: 'Research', color: 'blue', collapsed: false }]
  const tabs = [{ id: 3, windowId: 1, groupId: 2, title: 'Example', url: 'https://example.com/' }]
  const chrome = {
    storage: { local: {
      get: async () => ({ tabbox: structuredClone(saved) }),
      set: async ({ tabbox }) => { saved = structuredClone(tabbox) },
    } },
    runtime: { onMessage: event(), onInstalled: event(), onStartup: event(), sendMessage: async () => {} },
    windows: { onFocusChanged: event(), onRemoved: event(), getAll: async () => [...new Set([1, ...groups.map(g => g.windowId)])].map(id => ({ id })), get: async id => {
      if (id !== 1 && !groups.some(g => g.windowId === id)) throw new Error('No window')
      return { id: 1 }
    } },
    tabGroups: {
      onCreated: event(), onUpdated: event(), onMoved: event(), onRemoved: event(),
      get: async id => { const group = groups.find(g => g.id === id); if (!group) throw new Error('No group'); return group },
      query: async query => groups.filter(g => query.windowId === undefined || g.windowId === query.windowId),
    },
    tabs: { onCreated: event(), onUpdated: event(), onMoved: event(), onDetached: event(), onAttached: event(), onRemoved: event(), query: async query => tabs.filter(t => query.groupId === undefined || t.groupId === query.groupId) },
    contextMenus: { onClicked: event(), create() {} }, action: { onClicked: event() },
  }
  vm.runInNewContext(source, { chrome, console: { log() {}, error() {} } })
  const message = msg => new Promise(resolve => chrome.runtime.onMessage.listeners[0](msg, {}, resolve))
  const update = async () => {
    chrome.tabGroups.onUpdated.listeners[0](groups[0])
    await message({ type: 'getStorage' }) // FIFO barrier
  }
  return { message, update, groups, tabs, chrome, seed: data => { saved = structuredClone(data) }, raw: () => saved }
}

test('worker excludes renamed live groups and resyncs them when rules are removed', async () => {
  const w = worker()
  assert.equal((await w.message({ type: 'setExclusions', exclusions: { tabs: [], groups: ['Claude'], windows: [] } })).ok, true)
  assert.equal(Object.keys(w.raw().windows[1].groups).length, 1)
  w.groups[0].title = 'Claude'
  await w.update()
  assert.equal(Object.keys(w.raw().windows[1].groups).length, 0)
  await w.message({ type: 'setExclusions', exclusions: { tabs: [], groups: [], windows: [] } })
  assert.equal(w.raw().windows[1].groups[2].title, 'Claude')
})

test('worker keeps named windows excluded across subsequent events and exports', async () => {
  const w = worker()
  await w.message({ type: 'setExclusions', exclusions: { tabs: [], groups: [], windows: [] } })
  await w.message({ type: 'setWindowName', windowKey: '1', name: 'Private' })
  await w.message({ type: 'setExclusions', exclusions: { tabs: [], groups: [], windows: ['Private'] } })
  await w.update()
  assert.equal(w.raw().windows[1].name, 'Private')
  assert.equal(Object.keys(w.raw().windows[1].groups).length, 0)
  assert.equal(Object.keys((await w.message({ type: 'exportBackup' })).backup.data.windows).length, 0)
  await w.message({ type: 'setExclusions', exclusions: { tabs: [], groups: [], windows: [] } })
  assert.equal(w.raw().windows[1].groups[2].tabs.length, 1)
})

test('worker prunes a tab as it navigates into an exclusion, without preserving its old snapshot as history', async () => {
  const w = worker()
  await w.message({ type: 'setExclusions', exclusions: { tabs: ['*private*'], groups: [], windows: [] } })
  w.tabs[0].url = 'https://private.example/'
  await w.update()
  assert.equal(Object.keys(w.raw().windows[1].groups).length, 0)
})

test('worker imports atomically, and imported history can be deleted using negative IDs', async () => {
  const w = worker()
  await w.message({ type: 'setExclusions', exclusions: { tabs: [], groups: [], windows: [] } })
  const backup = (await w.message({ type: 'exportBackup' })).backup
  backup.data.windows[1].groups[2].tabs[0].closed = true
  assert.equal((await w.message({ type: 'importBackup', text: JSON.stringify(backup) })).ok, true)
  const imported = Object.values(w.raw().windows).find(win => win.id < 0)
  const group = Object.values(imported.groups)[0]
  const deleted = await w.message({ type: 'deleteTab', windowKey: String(imported.id), groupKey: String(group.id), tabId: group.tabs[0].id })
  assert.equal(deleted.ok, true)
  assert.equal(Object.values(w.raw().windows[imported.id].groups)[0].tabs.length, 0)
  const before = JSON.stringify(w.raw())
  assert.equal((await w.message({ type: 'importBackup', text: '{bad' })).ok, false)
  assert.equal(JSON.stringify(w.raw()), before)
})

test('a group moved into an excluded window is removed from its previous stored window', async () => {
  const w = worker()
  w.groups.push({ id: 6, windowId: 5, title: 'Other', color: 'blue', collapsed: false })
  await w.message({ type: 'setExclusions', exclusions: { tabs: [], groups: [], windows: [] } })
  await w.message({ type: 'setWindowName', windowKey: '5', name: 'Private' })
  await w.message({ type: 'setExclusions', exclusions: { tabs: [], groups: [], windows: ['Private'] } })
  w.groups[0].windowId = 5
  await w.update()
  assert.equal(Object.keys(w.raw().windows[1].groups).length, 0)
  assert.equal(Object.keys(w.raw().windows[5].groups).length, 0)
})

for (const [title, windowId] of [['Research', 1], ['Research', 5], ['', 1]]) {
  test(`distinct live groups stay separate: title=${JSON.stringify(title)}, window=${windowId}`, async () => {
    const w = worker()
    w.groups[0].title = title
    w.groups.push({ id: 6, windowId, title, color: 'red', collapsed: false })
    w.tabs.push({ id: 7, windowId, groupId: 6, title: 'Other', url: 'https://other.example/' })
    await w.message({ type: 'setExclusions', exclusions: { tabs: [], groups: [], windows: [] } })
    const saved = Object.values(w.raw().windows).flatMap(win => Object.values(win.groups))
    assert.equal(saved.length, 2)
    assert.deepEqual(saved.map(g => g.id).sort(), [2, 6])
    assert.ok(saved.every(g => g.tabs.length === 1 && !g.tabs[0].closed))
  })
}

function savedGroup(id, url = 'https://example.com/') {
  return { id, windowId: 1, closed: true, title: 'Research', color: 'blue', tabs: [
    { id: id + 100, closed: false, title: 'Saved', url },
    { id: id + 200, closed: true, title: 'History', url: 'https://history.example/' },
  ] }
}
const savedData = groups => ({ exclusions: { tabs: [], groups: [], windows: [] }, windows: { 1: { id: 1, closed: false, groups } } })

test('reattach an unbound group with matching title and URLs, keeping its history', async () => {
  const w = worker()
  w.seed(savedData({ 20: savedGroup(20) }))
  await w.update()
  const groups = Object.values(w.raw().windows[1].groups)
  assert.equal(groups.length, 1)
  assert.equal(groups[0].id, 2)
  assert.ok(groups[0].tabs.some(t => t.url === 'https://history.example/' && t.closed))
})

test('ambiguous or unrelated saved groups are not overwritten by a title match', async () => {
  for (const candidates of [{ 20: savedGroup(20), 21: savedGroup(21) }, { 20: savedGroup(20, 'https://unrelated.example/') }]) {
    const w = worker()
    w.seed(savedData(candidates))
    await w.update()
    assert.equal(Object.keys(w.raw().windows[1].groups).length, Object.keys(candidates).length + 1)
    for (const id of Object.keys(candidates)) assert.equal(w.raw().windows[1].groups[id].id, Number(id))
  }
})
