// Integration tests for Atlas's useDocument migration (phase 3).
//
// These exercise Atlas's EXACT persistence configuration — one document per
// code-file (visited.json / wishlist.json as ISO-3 arrays), identity = the bare
// code, merge = mergeCodeSets, mode:'lww' — against the REAL Möbius runtime
// (frontend/public/mobius-runtime.js → createUseDocument + makeStorage) running
// on fake-indexeddb with a controlled fetch. They assert the four properties
// the migration must hold:
//   (a) adding a code persists through the hook (durable write reaches the
//       server, optimistic value is read-your-writes);
//   (b) a rejected update surfaces an error (rejects + sets lastError) — it
//       never reads as a false "saved";
//   (c) two concurrent updates converge to the UNION (no code lost);
//   (d) reads work offline (the runtime's read-through mirror serves the
//       last-known value through an outage).
//
// The runtime + harness live in the data-layer worktree (the source of truth
// for the primitives); we import them by absolute path so this test pins the
// real machinery, not a reimplementation. mergeCodeSets comes from Atlas's own
// built bundle so we test the merge Atlas actually ships.
//
// Run:
//   cd app-atlas && npm test            # part of the tests/ glob
import { test } from 'node:test'
import assert from 'node:assert/strict'

const WT = '/home/hmzmrzx/projects/mobius/.claude/worktrees/data-layer/frontend'
const { freshEnv, tick, waitFor } = await import(
  `${WT}/src/lib/__tests__/mobiusRuntimeHarness.mjs`
)
const { createUseDocument, makeStorage, DurableWriteError } = await import(
  `${WT}/public/mobius-runtime.js`
)
const { mergeCodeSets } = await import('./.build/index.mjs')

// Atlas's document options (mirrors the Atlas component's docOpts).
const codeIdentity = (code) => String(code)
const atlasDocOpts = () => ({
  initial: [],
  identity: codeIdentity,
  merge: mergeCodeSets,
  mode: 'lww',
})

// A re-rendering React-hooks driver. Persists hook slots across renders so the
// same useState/useRef cells are reused, runs effects once on first render, and
// re-invokes the hook on demand so we can observe value/status/lastError evolve
// as the store reconciles. Modeled on the runtime test's shim, extended to
// support re-render + multiple state hooks.
function makeHookDriver() {
  const stateSlots = []
  const refSlots = []
  let stateIndex = 0
  let refIndex = 0
  const pendingEffects = []
  let rerender = () => {}
  const React = {
    useState(init) {
      const i = stateIndex++
      if (!(i in stateSlots)) stateSlots[i] = typeof init === 'function' ? init() : init
      const setState = (next) => {
        stateSlots[i] = typeof next === 'function' ? next(stateSlots[i]) : next
        rerender()
      }
      return [stateSlots[i], setState]
    },
    useRef(init) {
      const i = refIndex++
      if (!(i in refSlots)) refSlots[i] = { current: init }
      return refSlots[i]
    },
    useCallback(fn) { return fn },
    useEffect(fn) { pendingEffects.push(fn) },
  }
  const cleanups = []
  function mount(hook) {
    let handle
    let first = true
    rerender = () => {
      stateIndex = 0
      refIndex = 0
      handle = hook()
    }
    rerender()
    // Run effects once (mount). Mirrors React running effects after first paint.
    for (const fn of pendingEffects) {
      const c = fn()
      if (typeof c === 'function') cleanups.push(c)
    }
    pendingEffects.length = 0
    first = false
    return {
      get value() { return handle.value },
      get status() { return handle.status },
      get lastError() { return handle.lastError },
      update: (fn) => handle.update(fn),
      set: (v) => handle.set(v),
      refresh: () => handle.refresh(),
    }
  }
  return { React, mount, cleanup: () => cleanups.forEach((c) => c()) }
}

async function newStorage(appId = '1') {
  return makeStorage({ appId, getToken: async () => 'test-token' })
}

// (a) Adding a code persists through the hook.
test('adding a code persists via the hook (durable write reaches the server)', async () => {
  const { server } = freshEnv()
  const s = await newStorage()
  const d = makeHookDriver()
  const useDocument = createUseDocument(s, d.React)
  const doc = d.mount(() => useDocument('visited.json', atlasDocOpts()))

  await waitFor(() => doc.status === 'ready')
  assert.deepEqual(doc.value, [])

  const res = await doc.update((prev) => [...prev, 'JPN'])
  assert.equal(res.durability, 'synced')
  // Read-your-writes: the optimistic value carries the new code immediately.
  assert.deepEqual(doc.value, ['JPN'])
  // And it actually landed on the server (not a false local-only "saved").
  assert.deepEqual(server.serverValue('visited.json'), ['JPN'])
  d.cleanup()
})

// (b) A rejected update surfaces an error — never a false "saved".
test('a dead-lettered update rejects and sets lastError (no false saved)', async () => {
  const { server } = freshEnv()
  const s = await newStorage()
  const d = makeHookDriver()
  const useDocument = createUseDocument(s, d.React)
  const doc = d.mount(() => useDocument('visited.json', atlasDocOpts()))
  await waitFor(() => doc.status === 'ready')

  // 413 is a fatal 4xx → the runtime dead-letters it; durableWrite rejects.
  server.forceWrite('visited.json', 413)
  let threw = null
  try {
    await doc.update((prev) => [...prev, 'USA'])
  } catch (e) {
    threw = e
  }
  assert.ok(threw instanceof DurableWriteError, 'update must reject on dead-letter')
  assert.equal(threw.code, 'dead_letter')
  // The hook surfaces the error rather than reporting success.
  await waitFor(() => doc.status === 'error')
  assert.ok(doc.lastError instanceof DurableWriteError)
  // The server NEVER accepted the refused write.
  assert.equal(server.serverHas('visited.json'), false)
  d.cleanup()
})

// (c) Cross-context convergence is a UNION (no code lost). A code another tab
// added must survive this tab's next write. Under mode:'lww' the update merges
// against `theirs` = the current read-through value; once this context has
// OBSERVED the sibling write (the runtime's SWR read mirrors the server value),
// mergeCodeSets unions it with the local add — neither is lost. (The observe
// step models the SWR background revalidate a real tab receives; without it, a
// write that races a not-yet-seen sibling write is the documented lww
// last-writer-wins case, which CAS mode — not yet live — would tighten.)
test('cross-context convergence unions an observed sibling add with the local add', async () => {
  const { server } = freshEnv()
  const s = await newStorage()
  const d = makeHookDriver()
  const useDocument = createUseDocument(s, d.React)
  const doc = d.mount(() => useDocument('visited.json', atlasDocOpts()))
  await waitFor(() => doc.status === 'ready')

  // Shared baseline both contexts saw.
  await doc.update(() => ['CAN'])
  assert.deepEqual(server.serverValue('visited.json'), ['CAN'])

  // A concurrent context (another tab/device) adds USA on the server, then this
  // context observes it (SWR revalidate mirrors the fresh server value).
  server.seed('visited.json', ['CAN', 'USA'])
  await waitFor(async () => {
    const v = await s.get('visited.json') // SWR: serves mirror, kicks revalidate
    return Array.isArray(v) && v.includes('USA')
  })

  // Now this context adds JPN. The lww update's `theirs` read sees CAN+USA and
  // mergeCodeSets unions in JPN: all three survive, none lost.
  await doc.update((prev) => [...new Set([...prev, 'JPN'])])
  assert.deepEqual(new Set(server.serverValue('visited.json')), new Set(['CAN', 'USA', 'JPN']))
  assert.deepEqual(new Set(doc.value), new Set(['CAN', 'USA', 'JPN']))
  d.cleanup()
})

// Two in-process concurrent updates on the same doc serialize (not interleave)
// and both adds survive — the per-document update chain + union merge.
test('two concurrent in-process updates serialize and both adds survive', async () => {
  const { server } = freshEnv()
  const s = await newStorage()
  const d = makeHookDriver()
  const useDocument = createUseDocument(s, d.React)
  const doc = d.mount(() => useDocument('visited.json', atlasDocOpts()))
  await waitFor(() => doc.status === 'ready')

  const p1 = doc.update((prev) => [...prev, 'FRA'])
  const p2 = doc.update((prev) => [...prev, 'DEU'])
  await Promise.all([p1, p2])
  assert.deepEqual(new Set(server.serverValue('visited.json')), new Set(['FRA', 'DEU']))
  d.cleanup()
})

// (d) Reads work offline — the runtime's read-through mirror serves the
// last-known value through an outage (Atlas's offline guarantee).
test('a code written online is readable offline through the hook', async () => {
  const { server } = freshEnv()
  const s = await newStorage()
  const d = makeHookDriver()
  const useDocument = createUseDocument(s, d.React)
  const doc = d.mount(() => useDocument('visited.json', atlasDocOpts()))
  await waitFor(() => doc.status === 'ready')

  await doc.update(() => ['BRA', 'ARG'])
  assert.deepEqual(server.serverValue('visited.json'), ['BRA', 'ARG'])

  // Go offline; a fresh read still serves the mirrored value.
  server.setOnline(false)
  assert.deepEqual(await s.get('visited.json'), ['BRA', 'ARG'])
  d.cleanup()
})

// An offline write QUEUES (durably) rather than throwing — it is not an error,
// so Atlas must not surface one. It drains to the server on reconnect.
test('an offline write queues durably and drains on reconnect (not an error)', async () => {
  const { server } = freshEnv()
  const s = await newStorage()
  const d = makeHookDriver()
  const useDocument = createUseDocument(s, d.React)
  const doc = d.mount(() => useDocument('visited.json', atlasDocOpts()))
  await waitFor(() => doc.status === 'ready')

  server.setOnline(false)
  const res = await doc.update((prev) => [...prev, 'NOR'])
  // Queued, NOT rejected — Atlas treats this as in-flight, never an error.
  assert.equal(res.durability, 'queued')
  assert.equal(await s.pendingCount(), 1)

  server.setOnline(true)
  s._drain()
  await waitFor(async () => (await s.pendingCount()) === 0)
  assert.deepEqual(server.serverValue('visited.json'), ['NOR'])
  d.cleanup()
})
