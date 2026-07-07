// Vendored, self-contained test double for the Möbius document runtime.
//
// WHY THIS EXISTS: persistence.test.mjs used to import the REAL runtime + a
// harness from a private worktree path
// (/home/hmzmrzx/projects/mobius/.claude/worktrees/data-layer/frontend). That
// path does not exist on a fresh clone or in CI, so the tests failed to load
// before running (and the harness also mutated getter-only globalThis.navigator
// on current Node). This module vendors a COMPACT MODEL of the runtime's
// document contract — NOT the production runtime — so the tests are portable and
// run with zero dependencies.
//
// It faithfully models exactly the four durability properties Atlas's
// persistence wiring (its docOpts + mergeCodeSets) relies on:
//   (a) a durable write reaches the server and is optimistically read-your-writes;
//   (b) a dead-lettered (fatal 4xx) write REJECTS and surfaces lastError,
//       never a false "saved";
//   (c) two updates that see a sibling's value converge to the UNION via the
//       app-supplied `merge` (mergeCodeSets), losing nothing;
//   (d) reads work offline (last-known mirror) and an offline write QUEUES
//       durably and drains on reconnect.
//
// This is a behavioural double, deliberately small. It is not a substitute for
// the real runtime's own test-suite; it locks in the CONTRACT Atlas depends on
// so a regression in Atlas's merge/docOpts is caught here.

const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)))

// The env (server) is a module singleton set by freshEnv() and captured by the
// next makeStorage() — mirroring how the real makeStorage talks to a per-test
// server through a shared fetch mock.
let currentEnv = null

export const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

// Poll `pred` (sync or async) until it returns truthy, or throw on timeout.
export async function waitFor(pred, { timeout = 2000, interval = 5 } = {}) {
  const start = Date.now()
  for (;;) {
    if (await pred()) return
    if (Date.now() - start > timeout) throw new Error('waitFor: timed out')
    await new Promise((resolve) => setTimeout(resolve, interval))
  }
}

export class DurableWriteError extends Error {
  constructor(message, code) {
    super(message)
    this.name = 'DurableWriteError'
    this.code = code
  }
}

// A fresh in-memory server + online toggle for one test.
export function freshEnv() {
  const store = new Map() // path -> durable server value (the source of truth)
  const forced = new Map() // path -> HTTP status to force on the next write
  let online = true
  const server = {
    serverValue: (path) => (store.has(path) ? clone(store.get(path)) : undefined),
    serverHas: (path) => store.has(path),
    seed: (path, value) => {
      store.set(path, clone(value))
    },
    // Force the next write to `path` to fail with a fatal status (dead-letter).
    forceWrite: (path, status) => {
      forced.set(path, status)
    },
    setOnline: (value) => {
      online = !!value
    },
    __online: () => online,
    __read: (path) => (store.has(path) ? clone(store.get(path)) : undefined),
    __write: (path, value) => {
      if (forced.has(path)) {
        const status = forced.get(path)
        forced.delete(path)
        return { ok: false, status } // fatal 4xx → dead-letter
      }
      if (!online) return { ok: false, status: 0, offline: true }
      store.set(path, clone(value))
      return { ok: true, status: 200 }
    },
  }
  currentEnv = { server }
  return { server }
}

// makeStorage — the app-scoped storage layer: a read-through mirror (last-known
// value, serves offline), a durable write path that merges against the server's
// current value, and an offline write queue that drains on reconnect.
export function makeStorage({ appId } = {}) {
  const env = currentEnv
  if (!env) throw new Error('makeStorage called before freshEnv')
  const server = env.server
  const mirror = new Map() // last-known read-through cache (also the offline read source)
  const queue = [] // pending offline writes, drained by _drain() on reconnect
  void appId

  return {
    async get(path) {
      if (server.__online()) {
        const v = server.__read(path)
        if (v !== undefined) mirror.set(path, clone(v)) // SWR revalidate mirrors fresh server value
      }
      if (mirror.has(path)) return clone(mirror.get(path))
      const v = server.__online() ? server.__read(path) : undefined
      return v === undefined ? null : clone(v)
    },
    // Durable write: merge(base, mine, theirs) resolves this write against the
    // server's current value; offline writes queue instead of failing.
    async durableWrite(path, { base, value }, { merge } = {}) {
      const theirs = server.__online()
        ? server.__read(path) ?? []
        : mirror.get(path) ?? base ?? []
      const merged = merge ? merge(base ?? [], value, theirs ?? []) : value
      if (!server.__online()) {
        queue.push({ path, value: merged })
        mirror.set(path, clone(merged))
        return { durability: 'queued', value: clone(merged) }
      }
      const res = server.__write(path, merged)
      if (!res.ok) return { durability: 'error', deadLetter: true }
      mirror.set(path, clone(merged))
      return { durability: 'synced', value: clone(merged) }
    },
    async pendingCount() {
      return queue.length
    },
    _drain() {
      if (!server.__online()) return
      while (queue.length) {
        const { path, value } = queue.shift()
        server.__write(path, value)
        mirror.set(path, clone(value))
      }
    },
  }
}

// createUseDocument — the hook factory. Returns a { value, status, lastError,
// update, set, refresh } shape identical to what Atlas consumes. update()
// serializes writes per document (a promise chain), applies the optimistic
// value immediately (read-your-writes), and REJECTS on a dead-letter.
export function createUseDocument(storage, React) {
  return function useDocument(path, opts = {}) {
    const initial =
      typeof opts.initial === 'function' ? opts.initial() : opts.initial ?? null
    const [state, setState] = React.useState({
      value: initial,
      status: 'loading',
      lastError: null,
    })
    const valueRef = React.useRef(initial)
    const chainRef = React.useRef(Promise.resolve())
    const set = (value, status = 'ready', lastError = null) => {
      valueRef.current = value
      setState({ value, status, lastError })
    }
    React.useEffect(() => {
      storage.get(path).then((v) => set(v == null ? initial : v, 'ready', null))
    })
    const update = React.useCallback((fn) => {
      const run = async () => {
        const base = valueRef.current
        const optimistic = fn(base)
        set(optimistic, 'saving', null) // read-your-writes
        const res = await storage.durableWrite(
          path,
          { base, value: optimistic },
          { merge: opts.merge },
        )
        if (res.deadLetter) {
          const err = new DurableWriteError(`durable write rejected: ${path}`, 'dead_letter')
          set(valueRef.current, 'error', err)
          throw err
        }
        set(res.value, 'ready', null)
        return { durability: res.durability }
      }
      // Serialize concurrent updates on this doc so both survive (no interleave).
      const p = chainRef.current.then(run, run)
      chainRef.current = p.then(
        () => {},
        () => {},
      )
      return p
    })
    return {
      value: state.value,
      status: state.status,
      lastError: state.lastError,
      update,
      set: (v) => update(() => v),
      refresh: async () => {},
    }
  }
}
