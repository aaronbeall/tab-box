import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { buildSync } from 'esbuild'
import React from 'react'
import { create, act } from 'react-test-renderer'

const require = createRequire(import.meta.url)
const source = buildSync({ entryPoints: ['web/src/Panel.tsx'], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react', 'react/*', 'react-icons/*'], loader: { '.png': 'dataurl' } }).outputFiles[0].text
const data = title => ({ windows: { 1: { id: 1, closed: false, name: 'Work', groups: { 2: {
  id: 2, windowId: 1, closed: false, collapsed: false, title, color: 'blue', tabs: [
    { id: 3, closed: false, title: 'Open page', url: 'https://example.com/' },
    { id: 4, closed: true, title: 'History page', url: 'https://history.example/' },
  ],
} } } } })
const text = node => typeof node === 'string' ? node : (node?.children || []).map(text).join('')
async function panel() {
  const listeners = new Set()
  const pending = []
  let hold = false
  const chrome = {
    runtime: { id: 'test', onMessage: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) }, sendMessage: async msg => {
      assert.equal(msg.type, 'getStorage')
      if (hold) return new Promise(resolve => pending.push(resolve))
      return { ok: true, data: data('Research') }
    } }, windows: { getCurrent: async () => ({ id: 1 }) },
  }
  const module = { exports: {} }
  vm.runInNewContext(source, { require, module, exports: module.exports, chrome, console })
  let rendered
  await act(async () => { rendered = create(React.createElement(module.exports.default)) })
  return { rendered, pending, listeners, refresh: () => { hold = true; listeners.forEach(fn => fn({ type: 'storageChanged' })) } }
}

test('storage refresh keeps the tree mounted and history expanded', async () => {
  const p = await panel()
  try {
    const historyButton = p.rendered.root.findAllByType('button').find(node => text(node).includes('History ('))
    await act(async () => historyButton.props.onClick({ stopPropagation() {} }))
    assert.ok(text(p.rendered.root).includes('History page'))
    await act(async () => p.refresh())
    assert.ok(text(p.rendered.root).includes('History page'), 'refresh must not replace the expanded tree with a loading view')
    await act(async () => p.pending.shift()({ ok: true, data: data('Updated') }))
    assert.ok(text(p.rendered.root).includes('History page'), 'history must stay expanded after refresh')
  } finally {
    await act(async () => { p.pending.splice(0).forEach(resolve => resolve({ ok: true, data: data('Research') })); p.rendered.unmount() })
  }
})

test('a late refresh response cannot replace a newer model', async () => {
  const p = await panel()
  try {
    await act(async () => p.refresh())
    await act(async () => p.refresh())
    await act(async () => p.pending[1]({ ok: true, data: data('Newest group') }))
    assert.ok(text(p.rendered.root).includes('Newest group'))
    await act(async () => p.pending[0]({ ok: true, data: data('Stale group') }))
    assert.ok(text(p.rendered.root).includes('Newest group'))
    assert.ok(!text(p.rendered.root).includes('Stale group'))
  } finally { await act(async () => p.rendered.unmount()) }
})

test('a failed refresh preserves the last loaded tree and reports the failure', async () => {
  const p = await panel()
  try {
    await act(async () => p.refresh())
    await act(async () => p.pending[0]({ ok: false }))
    assert.ok(text(p.rendered.root).includes('Research'))
    assert.equal(p.rendered.root.findAll(node => node.props.role === 'alert').length, 1)
  } finally { await act(async () => p.rendered.unmount()) }
})
