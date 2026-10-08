import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { mount } from './_globe-hooks.mjs'

let Globe, buildDir, unavailable
before(async () => {
  let rolldown
  try {
    const modules = process.env.MOBIUS_FRONTEND_NODE_MODULES
    const spec = modules ? pathToFileURL(createRequire(join(modules, 'package.json')).resolve('rolldown')).href : 'rolldown'
    ;({ rolldown } = await import(spec))
  } catch (error) { unavailable = error; return }
  buildDir = await mkdtemp(join(tmpdir(), 'atlas-globe-lifecycle-'))
  const hooks = fileURLToPath(new URL('./_globe-hooks.mjs', import.meta.url))
  const build = await rolldown({
    input: fileURLToPath(new URL('../ui/Globe.jsx', import.meta.url)),
    platform: 'node', tsconfig: false, transform: { jsx: 'react-jsx' },
    plugins: [{
      name: 'lifecycle-doubles',
      resolveId(id) {
        if (id === 'react' || id === 'react/jsx-runtime') return { id: hooks, external: true }
        if (id === 'd3-geo' || id === './earthRenderer.js') return '\0' + id
      },
      load(id) {
        // Keep the independent geometry import pending. These tests exercise
        // the photographic layer while the complete SVG fallback is loading.
        if (id === '\0d3-geo') return 'await new Promise(() => {})'
        if (id === '\0./earthRenderer.js') return 'export const createEarthRenderer = (...args) => globalThis.__atlasTextureTest.createRenderer(...args)'
      },
    }],
  })
  try { await build.write({ dir: buildDir, entryFileNames: 'globe.mjs', chunkFileNames: '[name].mjs', format: 'es' }) }
  finally { await build.close() }
  ;({ Globe } = await import(pathToFileURL(join(buildDir, 'globe.mjs'))))
})
after(async () => { if (buildDir) await rm(buildDir, { recursive: true, force: true }) })

async function fixture(t, loadEarthTexture) {
  if (unavailable) { t.skip('Rolldown unavailable: set MOBIUS_FRONTEND_NODE_MODULES'); return }
  const listeners = new Set()
  const window = new EventTarget(), canvas = new EventTarget(), urls = [], revoked = []
  const add = window.addEventListener.bind(window), remove = window.removeEventListener.bind(window)
  window.addEventListener = (type, fn) => { if (type === 'online') listeners.add(fn); add(type, fn) }
  window.removeEventListener = (type, fn) => { if (type === 'online') listeners.delete(fn); remove(type, fn) }
  let renderers = 0, destroys = 0
  const timers = new Set()
  t.mock.method(globalThis, 'setTimeout', () => { const timer = {}; timers.add(timer); return timer })
  t.mock.method(globalThis, 'clearTimeout', timer => timers.delete(timer))
  t.mock.method(URL, 'createObjectURL', () => { const url = `blob:test-${urls.length}`; urls.push(url); return url })
  t.mock.method(URL, 'revokeObjectURL', url => revoked.push(url))
  const oldWindow = globalThis.window, oldImage = globalThis.Image, oldTest = globalThis.__atlasTextureTest
  globalThis.window = window
  globalThis.Image = class {
    set src(value) { this.url = value; this.onload?.() }
  }
  globalThis.__atlasTextureTest = { createRenderer: () => {
    renderers++
    return { destroy: () => destroys++, setCountryOutlines: () => false }
  } }
  const h = mount(Globe, { countries: [], visited: new Set(), wishlist: new Set(), loadEarthTexture }, {
    div: { clientWidth: 0, clientHeight: 0, addEventListener() {}, removeEventListener() {} }, canvas,
  })
  const flush = async () => { for (let i = 0; i < 20; i++) { await Promise.resolve(); h.flush() } }
  t.after(() => {
    if (h.mounted) h.unmount()
    assert.equal(timers.size, 0)
    assert.equal(listeners.size, 0, 'all online subscriptions are removed on cleanup')
    globalThis.window = oldWindow; globalThis.Image = oldImage; globalThis.__atlasTextureTest = oldTest
  })
  await flush()
  return { h, flush, urls, revoked, canvas, online: () => window.dispatchEvent(new Event('online')),
    get renderers() { return renderers }, get destroys() { return destroys } }
}

for (const failure of ['null', 'rejection']) test(`a first ${failure} texture read recovers online without rebuilding a successful renderer`, async t => {
  let reads = 0
  const f = await fixture(t, () => {
    reads++
    if (reads === 1) return failure === 'null' ? Promise.resolve(null) : Promise.reject(new Error('offline'))
    return Promise.resolve(new Blob(['texture']))
  })
  if (!f) return
  assert.equal(f.renderers, 0)
  f.online(); await f.flush()
  assert.equal(reads, 2)
  assert.equal(f.renderers, 1)
  f.online(); f.online(); await f.flush()
  assert.equal(reads, 2, 'a successful renderer must not be reloaded on online events')
  assert.equal(f.destroys, 0)
  f.h.unmount()
  assert.equal(f.destroys, 1)
  assert.deepEqual(f.revoked, f.urls)
  f.online(); await f.flush()
  assert.equal(reads, 2, 'cleanup unsubscribes retry listeners')
})

test('unmount during the online retry prevents late decode, URL allocation and state writes', async t => {
  let reads = 0, resolve
  const pending = new Promise(done => { resolve = done })
  const f = await fixture(t, () => ++reads === 1 ? Promise.resolve(null) : pending)
  if (!f) return
  f.online(); await f.flush()
  assert.equal(reads, 2)
  f.online(); await f.flush()
  assert.equal(reads, 2, 'online bursts must not restart a pending retry')
  f.h.unmount()
  resolve(new Blob(['late-texture'])); await f.flush()
  assert.equal(f.renderers, 0)
  assert.equal(f.urls.length, 0)
  assert.equal(f.h.lateUpdates, 0)
  f.online(); await f.flush()
  assert.equal(reads, 2)
})

test('unmount during the initial texture read ignores a late success', async t => {
  let resolve
  const f = await fixture(t, () => new Promise(done => { resolve = done }))
  if (!f) return
  f.h.unmount()
  resolve(new Blob(['late-texture'])); await f.flush()
  assert.equal(f.renderers, 0)
  assert.equal(f.urls.length, 0)
  assert.equal(f.h.lateUpdates, 0)
})
