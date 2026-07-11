// Atlas — thin app shell. The module tree is declared in mobius.json's
// source_files; the multi-file installer fetches each path and esbuild bundles
// from this entry, resolving the relative imports below at compile time.
//
//   constants.js  — bundled country facts, hero sayings, and nav state constants
//   theme.js      — the single app stylesheet (CSS)
//   domain.js     — pure + DOM-level globe/list/status logic; no React/network
//   storage.js    — static-geometry storage shim + bound useDocument hook
//   ui/*.jsx      — one React component per file
//
// Only Atlas lives here: it owns top-level app state, persistence wiring,
// shell navigation state, and mounts Globe / BottomSheet / SyncPill.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  NAV_IDLE,
  NAV_OPEN,
  NAV_POPPING,
  NAV_PUSHING,
  ROTATING_SAYINGS,
} from './constants.js'
import {
  EMPTY_CODES,
  codeIdentity,
  makeStorage,
  useDocument,
} from './storage.js'
import {
  STATUS_FILTERS,
  classifyStatusToggle,
  dedupeCountries,
  filterCountriesByStatus,
  mergeCodeSets,
  orderCountriesForList,
  pickRotatingSaying,
  prefRead,
  prefWrite,
  toIsoSet,
  toggleCountryStatus,
} from './domain.js'
import { Globe } from './ui/Globe.jsx'
import { BottomSheet } from './ui/BottomSheet.jsx'
import { SyncPill } from './ui/SyncPill.jsx'
import { CSS } from './theme.js'

// Fire-and-forget Reflection analytics. The optional chaining guards a missing
// runtime (tests, fallback host) so this is a silent no-op there; window.mobius
// .signal is itself documented as never-throwing. Payloads are always flat
// primitives, no PII (see each call site). This is the ONE analytics seam —
// keep every signal going through it so the guard and shape stay consistent.
function emitSignal(name, payload) {
  if (typeof window === 'undefined') return
  window.mobius?.signal?.(name, payload)
}

// globe_interacted throttle: a drag or wheel gesture fires its handler many
// times per second, but the signal only needs to answer "is the globe used,
// and in which mode" — not count frames. Coalesce to at most one signal per
// kind per window so a continuous gesture burst lands as a single event.
const GLOBE_INTERACT_THROTTLE_MS = 5000

export { bindUseDocument } from './storage.js'
export {
  PREF_KEY,
  ROTATION_SINGULARITY_LAT,
  STATUS_FILTERS,
  angularStepDeg,
  easePointerToDisc,
  filterCountriesByStatus,
  formatArea,
  formatLanguages,
  formatPopulation,
  lookupCountryInfo,
  mergeCodeSets,
  nextDragRotation,
  orderCountriesForList,
  pickRotatingSaying,
  prefRead,
  prefWrite,
  solveVersorDrag,
  toggleCountryStatus,
} from './domain.js'

export default function Atlas({ appId, token }) {
  const storage = useMemo(() => makeStorage({ appId, token }), [appId, token])

  const [countries, setCountries] = useState([])

  // The codes persist through useDocument — ONE document per code-file, the
  // existing storage layout (visited.json / wishlist.json as arrays of ISO-3).
  // mode:'lww' because every toggle is idempotent set membership; mergeCodeSets
  // makes cross-context convergence a UNION (no add ever lost) while still
  // honoring this context's removals. identity = the bare code, so a code is
  // never re-minted or reordered. This single hook replaces the whole former
  // distrust subsystem: the localStorage codes cache, the persisted unsynced
  // flag, the serialized save-chain + backoff retry, and the boot read-union —
  // useDocument's optimistic read-your-writes + durable writes + subscribe-
  // driven reconciliation do all of it.
  const docOpts = useMemo(
    () => ({
      initial: EMPTY_CODES,
      identity: codeIdentity,
      merge: mergeCodeSets,
      mode: 'lww',
      appId,
      token,
    }),
    [appId, token],
  )
  const visitedDoc = useDocument('visited.json', docOpts)
  const wishlistDoc = useDocument('wishlist.json', docOpts)
  // Render needs Sets (Globe / BottomSheet call .has / .size). Derive them from
  // the docs' optimistic values; visited wins over wishlist for any code that
  // a UNION-converged write left in both (the same exclusivity the toggles
  // enforce) so a country is never painted two states at once.
  const visited = useMemo(() => toIsoSet(visitedDoc.value), [visitedDoc.value])
  const wishlist = useMemo(() => {
    const v = toIsoSet(visitedDoc.value)
    return new Set([...toIsoSet(wishlistDoc.value)].filter((iso3) => !v.has(iso3)))
  }, [visitedDoc.value, wishlistDoc.value])

  const [selectedIso3, setSelectedIso3] = useState('')
  const [query, setQuery] = useState('')
  // Status filter (all / visited / wishlist) — a device-local VIEW preference
  // (not user data worth a server round-trip), restored on mount so the list
  // opens the way it was left. This is the only localStorage Atlas keeps.
  const [statusFilter, setStatusFilter] = useState(() => {
    const saved = prefRead(appId, 'status-filter')
    return STATUS_FILTERS.includes(saved) ? saved : 'all'
  })
  const [error, setError] = useState('')
  // Track online status so the SyncPill can announce offline mode.
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine !== false : true,
  )

  // Loading is the geometry read only — the codes hydrate independently through
  // useDocument (optimistic value renders immediately, status reports its own
  // progress). Boot no longer gates on the codes.
  const [loading, setLoading] = useState(true)
  // Distinguishes "fetched empty list" from "couldn't fetch at all". When
  // offline, storage.get returns null; the boot path flips this flag so we
  // can render an "offline — using last-known state" banner instead of
  // pretending the world has zero countries.
  const [offlineBoot, setOfflineBoot] = useState(false)
  // True once we have any visited codes to show — drives the offline banner
  // copy ("showing your last visited list" only when we actually have one).
  const hasCachedVisited = visited.size > 0

  // Hero saying (Change 4) — replaces the old big visited count, which just
  // duplicated the visited stamps already on the map. ONE line is picked at
  // random on mount and stays fixed for the session: no interval, so it never
  // re-rolls under the user's eyes (a changing line read as a glitch — owner
  // feedback). useState's initializer runs once per mount, which IS the
  // pick-once; a fresh pick only happens when the app is re-opened. An empty
  // ROTATING_SAYINGS array yields index -1 and the header renders no line.
  const [sayingIndex] = useState(() => pickRotatingSaying(ROTATING_SAYINGS, -1))
  const heroSaying = sayingIndex >= 0 ? ROTATING_SAYINGS[sayingIndex] : ''

  // ----- boot ----------------------------------------------------------
  // boot() loads ONLY the static world geometry now. The codes hydrate
  // independently through useDocument (its own read-through cache, optimistic
  // value, and subscribe-driven reconciliation) — so the whole former "read
  // visited/wishlist + union against in-flight local writes" dance is gone.
  // boot() lives outside the effect so the online listener can re-run it when
  // an offline cold-start later connects; it's idempotent (bootInFlightRef).
  const bootInFlightRef = useRef(false)
  const boot = useCallback(async () => {
    if (bootInFlightRef.current) return
    bootInFlightRef.current = true
    try {
      setLoading(true)
      const rawCountries = await storage.get('countries.geo.json')
      const freshCountries = Array.isArray(rawCountries) ? rawCountries : null
      const countriesList = dedupeCountries(freshCountries || [])
      setCountries(countriesList)

      // If we ended up with zero countries AND the network is offline, the
      // banner is honest: "offline, here's what we cached". If we have
      // countries (the runtime serves the precached copy offline), no banner.
      const isOffline =
        typeof navigator !== 'undefined' && navigator.onLine === false
      setOfflineBoot(countriesList.length === 0 && isOffline)

      if (countriesList.length === 0 && !isOffline) {
        // Online but we got nothing — flag a real error so the user knows
        // to try again instead of staring at an empty globe.
        setError('Could not load the world right now. Try again in a moment.')
        emitSignal('error', { message: 'world geometry loaded empty', source: 'boot' })
      } else {
        setError('')
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Atlas:boot failed', err)
      setError('Could not load the world right now. Try again in a moment.')
      emitSignal('error', { message: String(err?.message || err), source: 'boot' })
    } finally {
      setLoading(false)
      bootInFlightRef.current = false
    }
  }, [storage])

  useEffect(() => {
    boot().catch(() => {})
  }, [boot])

  // Online/offline tracking. We listen to the browser events directly —
  // the runtime doesn't proxy them.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const refresh = () => setOnline(navigator.onLine !== false)
    refresh()
    window.addEventListener('online', refresh)
    window.addEventListener('offline', refresh)
    return () => {
      window.removeEventListener('online', refresh)
      window.removeEventListener('offline', refresh)
    }
  }, [])

  // When the browser reconnects after an offline cold-start, retry boot
  // so the empty globe gets populated. boot() is idempotent and guards
  // against parallel runs via bootInFlightRef.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const onOnline = () => {
      // Only retry boot if we still don't have countries — otherwise we'd
      // wipe the user's view every reconnect.
      if (countries.length === 0) boot().catch(() => {})
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [boot, countries.length])

  // app_ready (Reflection) — fire ONCE, after boot has loaded the geometry and
  // both code docs have left 'loading' (a usable value, from cache or server).
  // This distinguishes a real Atlas open from a bare iframe load and reports
  // whether the app is empty or actively used. All-primitive payload, no PII.
  const appReadyFiredRef = useRef(false)
  useEffect(() => {
    if (appReadyFiredRef.current) return
    if (loading) return
    if (visitedDoc.status === 'loading' || wishlistDoc.status === 'loading') return
    appReadyFiredRef.current = true
    emitSignal('app_ready', {
      item_count: countries.length,
      visited_count: visited.size,
      wishlist_count: wishlist.size,
    })
  }, [loading, visitedDoc.status, wishlistDoc.status, countries.length, visited.size, wishlist.size])

  // ----- derived list (ordered, then narrowed) --------------------------
  // Order is alphabetical and never depends on marking — see
  // orderCountriesForList. The status filter narrows; it doesn't re-sort.
  const filteredCountries = useMemo(() => {
    const ordered = orderCountriesForList(countries, query)
    return filterCountriesByStatus(ordered, statusFilter, visited, wishlist)
  }, [countries, query, statusFilter, visited, wishlist])

  const changeStatusFilter = useCallback(
    (next) => {
      if (!STATUS_FILTERS.includes(next)) return
      setStatusFilter(next)
      prefWrite(appId, 'status-filter', next)
      // filter_changed (Reflection) — result_count is the size of the list the
      // new filter yields, so an unused or always-zero-result filter is visible.
      const ordered = orderCountriesForList(countries, query)
      const resultCount = filterCountriesByStatus(ordered, next, visited, wishlist).length
      emitSignal('filter_changed', { filter: next, result_count: resultCount })
    },
    [appId, countries, query, visited, wishlist],
  )

  // Surface a durable-write failure. doc.update REJECTS on a dead-letter (a
  // fatal 4xx the server refused) and sets doc.lastError; we must not let that
  // read as "saved". The toggle handlers catch the rejection to set this, and
  // we also watch lastError so a refused background reconcile shows too. A
  // transient/offline write is NOT an error — it queues durably and drains
  // later (status==='saving' drives the SyncPill), so only a real dead-letter
  // lands here.
  const [writeError, setWriteError] = useState('')
  useEffect(() => {
    const err = visitedDoc.lastError || wishlistDoc.lastError
    if (err) {
      setWriteError(
        "Couldn't save your change — it was rejected. Your other taps are safe; try again.",
      )
    }
  }, [visitedDoc.lastError, wishlistDoc.lastError])

  const visitedCount = visited.size
  const totalCount = countries.length

  // ----- nav state machine --------------------------------------------
  // navStateRef holds the current state without forcing a re-render; the
  // user-visible state is selectedIso3. closeRequestedRef flags "the user
  // closed while we were still PUSHING" — when the ACK eventually lands
  // it'll auto-emit nav-pop instead of stranding a phantom entry on the
  // shell's back-stack.
  const navStateRef = useRef(NAV_IDLE)
  const closeRequestedRef = useRef(false)
  const pendingRequestIdRef = useRef('')
  const ackHandlerRef = useRef(null)
  const ackTimerRef = useRef(0)

  const clearPendingAck = useCallback(() => {
    if (ackTimerRef.current) {
      clearTimeout(ackTimerRef.current)
      ackTimerRef.current = 0
    }
    if (ackHandlerRef.current) {
      window.removeEventListener('message', ackHandlerRef.current)
      ackHandlerRef.current = null
    }
    pendingRequestIdRef.current = ''
  }, [])

  const installAckHandler = useCallback(() => {
    if (typeof window === 'undefined') return
    if (ackHandlerRef.current) return // already installed
    const handler = (event) => {
      if (event.origin !== window.location.origin) return
      if (event.source !== window.parent) return
      if (!pendingRequestIdRef.current) return
      if (event.data?.requestId !== pendingRequestIdRef.current) return
      if (event.data.type !== 'moebius:nav-push-ack' && event.data.type !== 'moebius:nav-push-rejected') return
      const accepted = event.data.type === 'moebius:nav-push-ack'
      clearPendingAck()
      if (!accepted) {
        navStateRef.current = NAV_IDLE
        closeRequestedRef.current = false
        setSelectedIso3('')
        return
      }
      // ACK landed. What we do depends on whether the user already closed.
      if (navStateRef.current === NAV_PUSHING && closeRequestedRef.current) {
        // User closed before the ACK. Auto-pop so the back-stack stays
        // consistent and the late ACK doesn't strand a phantom entry.
        closeRequestedRef.current = false
        try {
          window.parent?.postMessage(
            { type: 'moebius:nav-pop' },
            window.location.origin,
          )
        } catch {
          // Older shell — no harm done.
        }
        navStateRef.current = NAV_IDLE
      } else if (navStateRef.current === NAV_PUSHING) {
        navStateRef.current = NAV_OPEN
      }
      // If we're already IDLE or POPPING by the time the ACK arrives,
      // ignore it — the state machine has already moved on.
    }
    window.addEventListener('message', handler)
    ackHandlerRef.current = handler
  }, [clearPendingAck])

  const navPush = useCallback(() => {
    if (typeof window === 'undefined' || !window.parent || window.parent === window) return
    if (navStateRef.current !== NAV_IDLE) return
    const requestId = `visited-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    pendingRequestIdRef.current = requestId
    closeRequestedRef.current = false
    navStateRef.current = NAV_PUSHING
    installAckHandler()
    ackTimerRef.current = window.setTimeout(() => {
      clearPendingAck()
      if (navStateRef.current === NAV_PUSHING) {
        navStateRef.current = NAV_IDLE
        closeRequestedRef.current = false
        setSelectedIso3('')
      }
    }, 5000)
    try {
      window.parent.postMessage(
        { type: 'moebius:nav-push', label: 'atlas-detail', requestId },
        window.location.origin,
      )
    } catch {
      // No shell — clear pending so we don't sit in PUSHING forever.
      clearPendingAck()
      navStateRef.current = NAV_IDLE
      setSelectedIso3('')
    }
  }, [clearPendingAck, installAckHandler])

  const navPop = useCallback(() => {
    if (typeof window === 'undefined' || !window.parent) return
    if (navStateRef.current === NAV_OPEN) {
      navStateRef.current = NAV_POPPING
      try {
        window.parent.postMessage(
          { type: 'moebius:nav-pop' },
          window.location.origin,
        )
      } catch {
        // Older shell — selection still clears locally.
      }
      navStateRef.current = NAV_IDLE
    } else if (navStateRef.current === NAV_PUSHING) {
      // Close happened before ACK; flag so the ACK handler auto-pops.
      closeRequestedRef.current = true
    }
    // From IDLE / POPPING: nothing to do.
  }, [])

  const deselect = useCallback(() => {
    setSelectedIso3('')
    navPop()
  }, [navPop])

  // Listen for shell back-button events. The shell emits moebius:nav-back
  // when the user swipes/taps back while we own a stack entry; clear
  // selection without echoing another nav-pop (the shell already popped).
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const onMessage = (event) => {
      if (event.origin !== window.location.origin) return
      if (event.source !== window.parent) return
      if (event.data?.type === 'moebius:nav-back') {
        navStateRef.current = NAV_IDLE
        closeRequestedRef.current = false
        setSelectedIso3('')
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  // Unmount: tear down any in-flight ACK listener so a late message
  // doesn't reach a dead component. If we still own a back-stack entry,
  // pop it so the shell doesn't keep a phantom around.
  useEffect(() => {
    return () => {
      if (ackHandlerRef.current) {
        window.removeEventListener('message', ackHandlerRef.current)
        ackHandlerRef.current = null
      }
      if (ackTimerRef.current) {
        clearTimeout(ackTimerRef.current)
        ackTimerRef.current = 0
      }
      if (navStateRef.current === NAV_OPEN || navStateRef.current === NAV_PUSHING) {
        try {
          window.parent?.postMessage(
            { type: 'moebius:nav-pop' },
            window.location.origin,
          )
        } catch {
          // No shell — no-op.
        }
      }
      navStateRef.current = NAV_IDLE
      closeRequestedRef.current = false
      pendingRequestIdRef.current = ''
    }
  }, [])

  // ----- toggles -------------------------------------------------------
  // A toggle is one idempotent set-membership flip. useDocument owns ALL the
  // durability that used to live here: the optimistic value renders the flip
  // instantly (read-your-writes), update() serializes writes per document so
  // rapid taps never race, and a queued/offline write drains itself — no
  // save-chain, no backoff retry, no unsynced flag, no localStorage mirror.
  //
  // visited and wishlist are mutually exclusive, so marking one clears the
  // other: we write BOTH documents (each its own serialized update). We pass a
  // FULL next array computed from each doc's current optimistic value (the raw
  // code arrays, not the render-derived Sets, which already cross-filter) rather
  // than mutating inside the updater, because the exclusivity spans two
  // documents — the crossing-out of the other status can't be expressed as a
  // single-doc delta. mergeCodeSets then reconciles each write against any
  // concurrent context, unioning adds and honoring this flip's removals.
  const applyToggle = useCallback(
    (country, status) => {
      if (!country) return
      setWriteError('')
      const beforeVisited = toIsoSet(visitedDoc.value)
      const beforeWishlist = toIsoSet(wishlistDoc.value)
      // Membership BEFORE the tap, visited winning (the render exclusivity), so
      // the create/delete/update classification matches what the user saw.
      const wasVisited = beforeVisited.has(country.iso3)
      const wasWishlist = !wasVisited && beforeWishlist.has(country.iso3)
      const next = toggleCountryStatus(beforeVisited, beforeWishlist, country.iso3, status)
      const nextVisited = Array.from(next.visited)
      const nextWishlist = Array.from(next.wishlist)

      // item_created / item_deleted / item_updated (Reflection) — one flat
      // signal for the status change so Reflection can tell travel history from
      // trip planning and see cross-status moves. Codes/status names only, no PII.
      const change = classifyStatusToggle(wasVisited, wasWishlist, status)
      if (change) {
        const { event, ...payload } = change
        emitSignal(event, payload)
      }

      // Surface a dead-letter rejection per document; a queued/offline write
      // resolves (durability 'queued') and is NOT an error.
      visitedDoc.update(() => nextVisited).catch(() => {
        setWriteError(
          `Couldn't save ${country.displayName} — the change was rejected. Try again.`,
        )
        emitSignal('error', { message: 'visited write rejected (dead-letter)', source: 'visited_write' })
      })
      wishlistDoc.update(() => nextWishlist).catch(() => {
        setWriteError(
          `Couldn't save ${country.displayName} — the change was rejected. Try again.`,
        )
        emitSignal('error', { message: 'wishlist write rejected (dead-letter)', source: 'wishlist_write' })
      })
    },
    [visitedDoc, wishlistDoc],
  )

  const toggleVisited = useCallback(
    (country) => applyToggle(country, 'visited'),
    [applyToggle],
  )
  const toggleWishlist = useCallback(
    (country) => applyToggle(country, 'wishlist'),
    [applyToggle],
  )

  // Tap on globe OR list row — select + open detail view. NEVER
  // toggles. The detail view's primary CTA is the only path to commit
  // a visited/not-visited change.
  const selectCountry = useCallback(
    (country) => {
      if (!country) return
      setSelectedIso3(country.iso3)
      navPush()
      // item_opened (Reflection) — frequent opens without status changes hint at
      // browsing/planning UX rather than checklist entry. Flat payload, no PII.
      emitSignal('item_opened', { type: 'country' })
    },
    [navPush],
  )

  // geometry_repaired (Reflection) — the globe repairs corrupt seed geometry
  // (rewinds inverted features, drops impossible sub-polygons) once d3-geo is
  // loaded. The repair happens inside Globe (that is where d3 lives, so the plan
  // 's "emit from boot" is adapted to a one-shot callback from Globe), and we
  // only emit when a repair ACTUALLY occurred — a silent repair is the early
  // warning worth surfacing; a clean seed is not news. Fires at most once.
  const geometryReportedRef = useRef(false)
  const reportGeometryRepair = useCallback((stats) => {
    if (geometryReportedRef.current) return
    if (!stats || (!stats.rewoundCount && !stats.droppedPolygonCount)) return
    geometryReportedRef.current = true
    emitSignal('geometry_repaired', {
      rewound_count: stats.rewoundCount,
      dropped_polygon_count: stats.droppedPolygonCount,
      country_count: stats.countryCount,
    })
  }, [])

  // globe_interacted (Reflection) — the one globe-usage signal. Without it there
  // is no way to tell whether the 3D globe (by far the app's most expensive
  // feature) actually earns its complexity or the partner only touches the list.
  // Globe reports raw interaction kinds ('drag' | 'zoom'); we throttle per kind
  // (see GLOBE_INTERACT_THROTTLE_MS) so a continuous drag/wheel stream emits one
  // signal per gesture-burst, not one per frame. Flat payload, no PII.
  const lastGlobeInteractRef = useRef({})
  const reportGlobeInteract = useCallback((kind) => {
    if (kind !== 'drag' && kind !== 'zoom') return
    const now = Date.now()
    if (now - (lastGlobeInteractRef.current[kind] || 0) < GLOBE_INTERACT_THROTTLE_MS) return
    lastGlobeInteractRef.current[kind] = now
    emitSignal('globe_interacted', { kind })
  }, [])

  const selectedCountry = useMemo(
    () => (selectedIso3 ? countries.find((c) => c.iso3 === selectedIso3) || null : null),
    [countries, selectedIso3],
  )

  // ----- render --------------------------------------------------------
  return (
    <div className="cb-app">
      <style>{CSS}</style>

      <header className="cb-header">
        <div className="cb-brand">
          {/* The app's own glossy icon as the brand mark (downscaled +
              cached); the accent dot is the fallback when this install has
              no custom icon and the route 404s. */}
          <img
            src={`/api/apps/${appId}/icon?size=64`}
            alt=""
            width={34}
            height={34}
            className="cb-brand-icon"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
              const f = e.currentTarget.nextElementSibling
              if (f) f.style.display = 'flex'
            }}
          />
          <span className="cb-brand-fallback" style={{ display: 'none' }} aria-hidden="true">·</span>
          {/* Rotating hero saying (Change 4). The old "N stamps on the map."
              count duplicated the visited stamps already on the globe AND the
              counter chip on the right; a rotating short line replaces it. When
              ROTATING_SAYINGS is emptied heroSaying is '' and the <h1> is
              omitted entirely — clearing the list cleanly removes the line. */}
          {heroSaying ? <h1 className="cb-saying">{heroSaying}</h1> : null}
        </div>
        <div className="cb-header-meta">
          {/* Silent when healthy — renders only when offline (see SyncPill). */}
          <SyncPill online={online} hasRuntime={storage.hasRuntime()} />
          {/* The single source of progress now: a balanced "visited / total"
              chip (both numbers the same weight — see .cb-counter). The hero
              line is flavor; this is the number. */}
          <div
            className={'cb-counter' + (offlineBoot ? ' cb-counter--faded' : '')}
            aria-label={`${visitedCount} of ${totalCount} countries visited`}
          >
            <span className="cb-counter-now">{visitedCount}</span>
            <span className="cb-counter-sep" aria-hidden="true">/</span>
            <span className="cb-counter-total">{totalCount || '…'}</span>
          </div>
        </div>
      </header>

      {offlineBoot ? (
        <div className="cb-banner" role="status">
          {hasCachedVisited
            ? "You're offline — showing your last visited list. The globe and full country list come back when you're online again."
            : "You're offline and we don't have a cached copy yet. Connect once and this app works offline forever after."}
        </div>
      ) : null}

      {error || writeError ? (
        <div className="cb-error" role="alert" aria-live="polite">
          {error || writeError}
        </div>
      ) : null}

      <div className="cb-globe-shell">
        {loading ? (
          <div className="cb-globe-loading">Loading the world…</div>
        ) : (
          <Globe
            countries={countries}
            visited={visited}
            wishlist={wishlist}
            selectedIso3={selectedIso3}
            statusFilter={statusFilter}
            onTapCountry={selectCountry}
            onTapOcean={deselect}
            onGeometryRepaired={reportGeometryRepair}
            onInteract={reportGlobeInteract}
          />
        )}
      </div>

      <BottomSheet
        countries={filteredCountries}
        visited={visited}
        wishlist={wishlist}
        selectedCountry={selectedCountry}
        query={query}
        statusFilter={statusFilter}
        loading={loading}
        onQueryChange={setQuery}
        onFilterChange={changeStatusFilter}
        onSelect={selectCountry}
        onToggleVisited={toggleVisited}
        onToggleWishlist={toggleWishlist}
        onDeselect={deselect}
      />
    </div>
  )
}
