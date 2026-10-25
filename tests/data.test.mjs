import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSync } from 'esbuild'

const source = buildSync({ entryPoints: ['web/src/data.ts'], bundle: true, write: false, format: 'esm', platform: 'node' }).outputFiles[0].text
const { matchesPattern, validateExclusions, applyExclusions, createBackup, importBackup, DEFAULT_EXCLUSIONS } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const none = { tabs: [], groups: [], windows: [] }
const fixture = () => ({ exclusions: structuredClone(none), windows: {
  1: { id: 1, closed: false, name: 'Work', groups: {
    2: { id: 2, windowId: 1, closed: false, title: 'Research', color: 'blue', tabs: [
      { id: 3, closed: false, title: 'Example', url: 'https://example.com/' },
      { id: 4, closed: true, title: 'Private', url: 'https://private.example/' },
    ] },
  } },
} })

test('whole-value, case-insensitive wildcards treat regex characters literally', () => {
  for (const [value, pattern, expected] of [
    ['Claude', 'claude', true], ['Claude in Chrome (1)', 'Claude in Chrome*', true],
    ['Personal Claude notes', 'Claude', false], ['https://example.com/a', 'https://example.com/*', true],
    ['abc', 'a?c', true], ['ac', 'a?c', false], ['a.b', 'a.b', true], ['axb', 'a.b', false],
    ['abbbc', '*b*c', true], ['anything', '*', true], ['', '*', true], ['abc', '*d', false],
  ]) assert.equal(matchesPattern(value, pattern), expected, `${value} / ${pattern}`)
})

test('default rules target Claude automation without blocking regular Claude website tabs', () => {
  assert.ok(DEFAULT_EXCLUSIONS.groups.includes('Claude'))
  const data = fixture()
  data.exclusions = undefined
  data.windows[1].groups[2].title = 'Claude'
  assert.deepEqual(applyExclusions(data).windows[1].groups, {})
  data.windows[1].groups[2].title = 'Research'
  data.windows[1].groups[2].tabs[0] = { id: 3, closed: false, title: 'My conversation - Claude', url: 'https://claude.ai/chat/123' }
  assert.equal(applyExclusions(data).windows[1].groups[2].tabs.length, 2)
})

test('filters live tabs and history; preserves original input', () => {
  const data = fixture()
  data.exclusions.tabs = ['*private*']
  assert.equal(applyExclusions(data).windows[1].groups[2].tabs.length, 1)
  assert.equal(data.windows[1].groups[2].tabs.length, 2)
  data.exclusions.tabs = ['*']
  assert.deepEqual(applyExclusions(data).windows[1].groups, {})
})

test('excluded window retains only its name internally so live events stay excluded', () => {
  const data = fixture()
  data.exclusions.windows = ['work']
  assert.deepEqual(applyExclusions(data).windows, {})
  const internal = applyExclusions(data, true)
  assert.equal(internal.windows[1].name, 'Work')
  assert.deepEqual(internal.windows[1].groups, {})
  assert.deepEqual(createBackup(internal).data.windows, {})
})

test('rules normalize whitespace and duplicates; empty arrays disable defaults', () => {
  assert.deepEqual(validateExclusions({ tabs: [' abc ', '', 'abc'], groups: [], windows: [] }), { tabs: ['abc'], groups: [], windows: [] })
  assert.throws(() => validateExclusions({ tabs: [4], groups: [], windows: [] }))
  assert.throws(() => validateExclusions({ tabs: Array(201).fill('*'), groups: [], windows: [] }))
  assert.equal(applyExclusions(fixture()).windows[1].groups[2].tabs.length, 2)
})

test('portable round trip remaps every ID, keeps history, and never attaches imported items to live Chrome IDs', () => {
  const current = fixture()
  const backup = JSON.stringify(createBackup(current))
  const imported = importBackup(current, backup)
  const win = Object.values(imported.windows).find(w => w.id < 0)
  assert.ok(win.closed)
  assert.equal(win.name, 'Work')
  const group = Object.values(win.groups)[0]
  assert.ok(group.closed)
  assert.equal(group.windowId, win.id)
  assert.deepEqual(group.tabs.map(t => t.closed), [false, true])
  const ids = [win.id, group.id, ...group.tabs.map(t => t.id)]
  assert.ok(ids.every(id => id < -1))
  assert.equal(new Set(ids).size, ids.length)
  const twice = importBackup(imported, backup)
  const negativeIds = Object.values(twice.windows).filter(w => w.id < 0).flatMap(w => [w.id, ...Object.values(w.groups).flatMap(g => [g.id, ...g.tabs.map(t => t.id)])])
  assert.equal(new Set(negativeIds).size, negativeIds.length)
  assert.deepEqual(current, fixture())
})

test('import uses local exclusions unless the user chooses imported rules', () => {
  const current = fixture()
  current.exclusions.tabs = ['*private*']
  const backup = JSON.stringify(createBackup(fixture()))
  const local = importBackup(current, backup)
  assert.ok(Object.values(local.windows).every(w => Object.values(w.groups).every(g => g.tabs.length === 1)))
  assert.deepEqual(importBackup(current, backup, true).exclusions, none)
})

test('invalid or executable backup data fails without mutating existing state', () => {
  const current = fixture()
  const backup = createBackup(fixture())
  assert.throws(() => importBackup(current, '{'))
  assert.throws(() => importBackup(current, JSON.stringify({ ...backup, version: 99 })))
  backup.data.windows[1].groups[2].tabs[0].url = 'javascript:alert(1)'
  assert.throws(() => importBackup(current, JSON.stringify(backup)))
  backup.data.windows[1].groups[2].tabs[0].url = 'https://example.com'
  backup.data.windows[1].groups[2].tabs[0].closed = 'false'
  assert.throws(() => importBackup(current, JSON.stringify(backup)))
  assert.throws(() => importBackup(current, ' '.repeat(10 * 1024 * 1024 + 1)))
  assert.deepEqual(current, fixture())
})
