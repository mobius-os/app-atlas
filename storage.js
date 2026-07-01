import React from 'react'

// --------------------------------------------------------------------------
// Read-only storage shim for the static world geometry.
// --------------------------------------------------------------------------
// The mutable user data (visited / wishlist codes) persists through
// useDocument — the runtime owns its durability, offline mirror, and
// cross-context reconciliation (see Atlas below). The ONE thing left for a
// plain read is countries.geo.json: a large, static, precached file we only
// ever GET. We probe the runtime per call (the shell can install it
// post-mount on some paths) and fall back to a direct fetch so a missing
// runtime still loads the world.
export function makeStorage({ appId, token }) {
  const auth = { Authorization: `Bearer ${token}` }
  const base = `/api/storage/apps/${appId}`

  const probe = () =>
    (typeof window !== 'undefined' && window.mobius?.storage) || null

  async function get(path) {
    const native = probe()
    if (native && typeof native.get === 'function') {
      try {
        return await native.get(path)
      } catch {
        // fall through to fetch — better a stale-but-real read than null
      }
    }
    try {
      const r = await fetch(`${base}/${path}`, { headers: auth })
      if (r.status === 404) return null
      if (!r.ok) return null
      const text = await r.text()
      if (!text) return null
      try {
        return JSON.parse(text)
      } catch {
        return null
      }
    } catch {
      return null
    }
  }

  // hasRuntime is a *probe*, not a cached boolean — readers call it when
  // they need a fresh answer (the SyncPill uses it on every render).
  function hasRuntime() {
    return !!probe()
  }

  return { get, hasRuntime }
}

// Bind the document hook ONCE at module top to the React this app already
// imports — `const useDocument = window.mobius.createUseDocument(React)`.
// Both app hosts (app-frame.html, standalone.py) init() the runtime before
// importing this module, so window.mobius is present at eval time. The
// fallback keeps the no-runtime/test path alive: a hook that reads/writes the
// app's own storage directly, with the SAME { value, status, update, set,
// refresh } shape, so the component code is identical either way. It cannot
// merge or reconcile across contexts — that's the runtime's job — but it
// preserves single-context read/add/remove/toggle when no runtime exists.
export function bindUseDocument(React) {
  if (typeof window !== 'undefined' && window.mobius?.createUseDocument) {
    return window.mobius.createUseDocument(React)
  }
  return makeFallbackUseDocument(React)
}

function makeFallbackUseDocument(React) {
  return function useDocument(path, opts = {}) {
    const initial = typeof opts.initial === 'function' ? opts.initial() : (opts.initial ?? null)
    const [state, setState] = React.useState({ value: initial, status: 'loading', lastError: null })
    const valueRef = React.useRef(initial)
    const chainRef = React.useRef(Promise.resolve())
    const tokenRef = React.useRef(opts.token)
    tokenRef.current = opts.token
    const set = (value, status = 'ready', lastError = null) => {
      valueRef.current = value
      setState({ value, status, lastError })
    }
    const direct = React.useCallback(async (method, body) => {
      const headers = { Authorization: `Bearer ${tokenRef.current}` }
      if (body !== undefined) headers['Content-Type'] = 'application/json'
      const r = await fetch(`/api/storage/apps/${opts.appId}/${path}`, {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      })
      return r
    }, [path, opts.appId])
    const refresh = React.useCallback(async () => {
      try {
        const r = await direct('GET')
        const text = r.ok ? await r.text() : ''
        const next = text ? JSON.parse(text) : initial
        set(next, 'ready', null)
        return next
      } catch (e) {
        setState((prev) => ({ ...prev, status: 'error', lastError: e }))
        throw e
      }
    }, [direct, initial])
    React.useEffect(() => { refresh().catch(() => {}) }, [refresh])
    const update = React.useCallback((fn) => {
      const run = async () => {
        const next = fn(valueRef.current)
        set(next, 'saving', null)
        const r = await direct('PUT', next)
        if (!r.ok) {
          const err = new Error(`storage ${path}: ${r.status}`)
          set(valueRef.current, 'error', err)
          throw err
        }
        set(next, 'ready', null)
        return { durability: 'synced' }
      }
      const p = chainRef.current.then(run, run)
      chainRef.current = p.then(() => {}, () => {})
      return p
    }, [direct])
    return { value: state.value, status: state.status, lastError: state.lastError, update, set: (v) => update(() => v), refresh }
  }
}

// Stable identity for a code list: the bare ISO-3 string. useDocument reuses
// item ids by content identity — for primitive codes the code IS the id, so
// reconciliation never re-mints or reorders a code already present.
export const codeIdentity = (code) => String(code)
// Shared empty seed for both code docs. A module-level constant (not a fresh
// [] per render) keeps useDocument's `initial` referentially stable, so its
// effects don't re-fire every render.
export const EMPTY_CODES = []

// Bound once for the whole module — every Atlas mount shares this hook.
export const useDocument = bindUseDocument(React)
