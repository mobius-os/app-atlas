import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// --------------------------------------------------------------------------
// Storage shim — offline runtime first, direct fetch fallback.
// --------------------------------------------------------------------------
// The Möbius shell exposes window.mobius.storage when the offline-runtime
// feature lands; until then this app talks to /api/storage directly with
// the bearer token the bootloader passes as a prop. Same call signature
// both ways so the call sites never branch.
function makeStorage({ appId, token }) {
  const native = typeof window !== 'undefined' ? window.mobius?.storage : null

  async function get(path) {
    if (native) return native.get(path)
    const r = await fetch(`/api/storage/apps/${appId}/${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (r.status === 404) return null
    if (!r.ok) throw new Error(`storage get ${path}: ${r.status}`)
    return r.json()
  }

  async function set(path, data) {
    if (native) return native.set(path, data)
    const r = await fetch(`/api/storage/apps/${appId}/${path}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })
    if (!r.ok) throw new Error(`storage set ${path}: ${r.status}`)
    return { synced: true }
  }

  // pendingCount surfaces the runtime outbox depth. Returns 0 in dev/fallback
  // mode (no runtime → no outbox → writes always go straight to the server).
  async function pendingCount() {
    if (native?.pendingCount) {
      try {
        return await native.pendingCount()
      } catch {
        return 0
      }
    }
    return 0
  }

  return { get, set, pendingCount, hasRuntime: !!native }
}

// --------------------------------------------------------------------------
// Helpers.
// --------------------------------------------------------------------------
const soften = (value) => String(value || '').toLowerCase().trim()
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const cubicOut = (t) => 1 - Math.pow(1 - t, 3)

// Initial rotation — Western Europe slightly above the equator. Easier to
// recognize than 0,0 (which puts the user in the Atlantic).
const INITIAL_ROTATION = [12, -22, 0]
const IDLE_SPIN_DEG_PER_FRAME = 0.035
const PAN_DURATION_MS = 950

// --------------------------------------------------------------------------
// Globe — orthographic d3-geo projection on an SVG canvas.
// --------------------------------------------------------------------------
function Globe({ countries, visited, selectedIso3, focusRequest, onTapCountry }) {
  const containerRef = useRef(null)
  const d3Ref = useRef(null)
  const animationRef = useRef(0)
  const idleRef = useRef(0)
  const dragRef = useRef({
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    startRotate: INITIAL_ROTATION.slice(),
  })
  const rotationRef = useRef(INITIAL_ROTATION.slice())
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [rotation, setRotation] = useState(INITIAL_ROTATION.slice())
  const [ready, setReady] = useState(false)
  // depFailed sticks once the d3-geo import gives up so the spinner doesn't
  // hang forever on a cold offline reload. The SW caches esm.sh cache-first,
  // so this should only ever trip the very first time an offline user opens
  // the app — after one online load, the bundle lives in the SW cache.
  const [depFailed, setDepFailed] = useState(false)

  // d3-geo lives at runtime — declared in manifest.runtime.esm_deps so the
  // install UI warns the user. Bundle suffix flattens the dep graph into a
  // single ES module so esm.sh doesn't ship a waterfall of small chunks.
  // A 5s timeout races the import so an offline cold-start can't hang on the
  // fetch indefinitely; the timeout-vs-error distinction doesn't matter to
  // the user, so both paths lead to the same "load when online again" copy.
  useEffect(() => {
    let active = true
    const timeoutMs = 5000
    let timeoutId = 0
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('d3-geo load timed out')), timeoutMs)
    })
    Promise.race([import('https://esm.sh/d3-geo@3?bundle'), timeoutPromise])
      .then((mod) => {
        clearTimeout(timeoutId)
        if (!active) return
        d3Ref.current = mod
        setReady(true)
      })
      .catch((err) => {
        clearTimeout(timeoutId)
        // eslint-disable-next-line no-console
        console.error('d3-geo failed to load', err)
        if (active) setDepFailed(true)
      })
    return () => {
      active = false
      clearTimeout(timeoutId)
    }
  }, [])

  // Track the visible size of the SVG host so the projection rescales when
  // the bottom sheet drags up/down.
  useEffect(() => {
    if (!containerRef.current) return
    const measure = () => {
      if (!containerRef.current) return
      setSize({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  const setRotationBoth = useCallback((next) => {
    rotationRef.current = next
    setRotation(next)
  }, [])

  const animateTo = useCallback(
    (target, duration = PAN_DURATION_MS) => {
      cancelAnimationFrame(animationRef.current)
      const start = rotationRef.current.slice()
      // Walk the short way around the globe — wrap longitudes so the
      // animation doesn't take the long route across the Pacific.
      let dLng = target[0] - start[0]
      while (dLng > 180) dLng -= 360
      while (dLng < -180) dLng += 360
      const endLng = start[0] + dLng
      const startedAt = performance.now()
      const step = (now) => {
        const t = clamp((now - startedAt) / duration, 0, 1)
        const k = cubicOut(t)
        const next = [
          start[0] + (endLng - start[0]) * k,
          start[1] + (target[1] - start[1]) * k,
          0,
        ]
        setRotationBoth(next)
        if (t < 1) animationRef.current = requestAnimationFrame(step)
      }
      animationRef.current = requestAnimationFrame(step)
    },
    [setRotationBoth],
  )

  // Smooth-pan when the parent asks us to focus a particular country.
  useEffect(() => {
    if (!ready || !focusRequest?.iso3 || !d3Ref.current) return
    const country = countries.find((c) => c.iso3 === focusRequest.iso3)
    if (!country) return
    const [lng, lat] = d3Ref.current.geoCentroid({
      type: 'Feature',
      properties: {},
      geometry: country.geometry,
    })
    animateTo([-lng, -lat, 0], focusRequest.duration ?? PAN_DURATION_MS)
  }, [animateTo, countries, focusRequest, ready])

  // Idle spin — runs every frame except during user drag or focus pan.
  // Honors prefers-reduced-motion: vestibular users see a still globe by
  // default, and the focus-pan animation still works because that's
  // user-initiated.
  useEffect(() => {
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) return
    cancelAnimationFrame(idleRef.current)
    const loop = () => {
      if (!dragRef.current.active) {
        // Skip idle motion while an explicit focus pan is animating so we
        // don't fight it. animationRef.current is the rAF id; zero = idle.
        if (!animationRef.current || animationRef.current === 0) {
          const [lng, lat, gamma] = rotationRef.current
          setRotationBoth([lng + IDLE_SPIN_DEG_PER_FRAME, lat, gamma])
        }
      }
      idleRef.current = requestAnimationFrame(loop)
    }
    idleRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(idleRef.current)
  }, [setRotationBoth])

  useEffect(() => () => cancelAnimationFrame(animationRef.current), [])

  // Re-compute projection on every rotation/size change.
  const projectionData = useMemo(() => {
    if (!ready || !d3Ref.current || !size.width || !size.height) return null
    const d3 = d3Ref.current
    // Big globe — radius scales to 46% of the smaller dim, leaving a
    // comfortable margin so even the antipode bulge doesn't clip.
    const radius = Math.min(size.width, size.height) * 0.46
    const projection = d3
      .geoOrthographic()
      .translate([size.width / 2, size.height / 2])
      .scale(radius)
      .clipAngle(90)
      .rotate(rotation)
      .precision(0.4)
    const path = d3.geoPath(projection)
    const graticule = d3.geoGraticule10()
    return { projection, path, graticule, radius }
  }, [ready, rotation, size.height, size.width])

  // ----- pointer drag --------------------------------------------------
  const onPointerDown = (event) => {
    cancelAnimationFrame(animationRef.current)
    animationRef.current = 0
    dragRef.current = {
      active: true,
      moved: false,
      startX: event.clientX,
      startY: event.clientY,
      startRotate: rotationRef.current.slice(),
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const onPointerMove = (event) => {
    if (!dragRef.current.active) return
    const dx = event.clientX - dragRef.current.startX
    const dy = event.clientY - dragRef.current.startY
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragRef.current.moved = true
    const [startLng, startLat] = dragRef.current.startRotate
    setRotationBoth([startLng + dx * 0.4, clamp(startLat - dy * 0.4, -85, 85), 0])
  }
  const finishDrag = (event) => {
    dragRef.current.active = false
    if (event?.currentTarget?.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    // Defer the moved flag so onClick (which fires after pointerup) still
    // sees moved=true and skips the tap when the user was dragging.
    setTimeout(() => {
      dragRef.current.moved = false
    }, 0)
  }
  const onPointerUp = (event) => finishDrag(event)
  const onPointerCancel = (event) => finishDrag(event)
  const onPointerLeave = () => {
    dragRef.current.active = false
  }

  return (
    <div ref={containerRef} className="cb-globe-canvas">
      {depFailed ? (
        <div className="cb-globe-loading cb-globe-loading--offline" role="status">
          Globe needs one online load — pull to refresh when you're back online.
        </div>
      ) : !projectionData ? (
        <div className="cb-globe-loading">Loading the world…</div>
      ) : (
        <svg
          className="cb-globe-svg"
          viewBox={`0 0 ${size.width} ${size.height}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onPointerLeave={onPointerLeave}
          style={{
            cursor: dragRef.current.active ? 'grabbing' : 'grab',
            touchAction: 'none',
          }}
        >
          <defs>
            <radialGradient id="cb-ocean" cx="40%" cy="32%">
              <stop offset="0%" stopColor="var(--cb-ocean-1)" />
              <stop offset="55%" stopColor="var(--cb-ocean-2)" />
              <stop offset="100%" stopColor="var(--cb-ocean-3)" />
            </radialGradient>
            <radialGradient id="cb-shine" cx="35%" cy="28%">
              <stop offset="0%" stopColor="var(--cb-shine-1)" />
              <stop offset="45%" stopColor="var(--cb-shine-2)" />
              <stop offset="100%" stopColor="var(--cb-shine-3)" />
            </radialGradient>
            <filter id="cb-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="16" />
            </filter>
          </defs>

          {/* Outer accent halo */}
          <circle
            cx={size.width / 2}
            cy={size.height / 2}
            r={projectionData.radius * 1.06}
            fill="var(--accent)"
            opacity="0.12"
            filter="url(#cb-glow)"
          />

          {/* Ocean sphere — stroke derives from --text so the rim stays
             visible on light themes (where pure-white would vanish). */}
          <path
            d={projectionData.path({ type: 'Sphere' })}
            fill="url(#cb-ocean)"
            stroke="color-mix(in srgb, var(--text) 22%, transparent)"
            strokeWidth="1"
          />

          {/* Graticule */}
          <path
            d={projectionData.path(projectionData.graticule)}
            fill="none"
            stroke="color-mix(in srgb, var(--text) 14%, transparent)"
            strokeWidth="0.6"
          />

          {/* Countries — each path is wrapped in a <g role="button"> with
             an accessible name + a <title> child. Screen readers read the
             country name (and visited state) instead of "image image image",
             and hover tooltips surface the name on desktop. */}
          {countries.map((country) => {
            const d = projectionData.path({
              type: 'Feature',
              properties: {},
              geometry: country.geometry,
            })
            if (!d) return null
            const isVisited = visited.has(country.iso3)
            const isSelected = country.iso3 === selectedIso3
            const label = isVisited
              ? `${country.displayName} — visited`
              : country.displayName
            return (
              <g
                key={country.iso3}
                role="button"
                aria-label={label}
                onClick={() => {
                  if (dragRef.current.moved) return
                  onTapCountry(country)
                }}
              >
                <title>{label}</title>
                <path
                  d={d}
                  className={
                    'cb-country' +
                    (isVisited ? ' cb-country--visited' : '') +
                    (isSelected ? ' cb-country--selected' : '')
                  }
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            )
          })}

          {/* Specular shine */}
          <path
            d={projectionData.path({ type: 'Sphere' })}
            fill="url(#cb-shine)"
            opacity="0.5"
            pointerEvents="none"
          />
        </svg>
      )}
    </div>
  )
}

// --------------------------------------------------------------------------
// Bottom sheet — vertically draggable list + search.
// --------------------------------------------------------------------------
const SHEET_MIN = 0.30  // 30% of viewport — collapsed
const SHEET_MID = 0.50  // 50% — neutral
const SHEET_MAX = 0.80  // 80% — expanded
const SHEET_STOPS = [SHEET_MIN, SHEET_MID, SHEET_MAX]

function BottomSheet({
  countries,
  visited,
  selectedIso3,
  query,
  onQueryChange,
  onSelect,
  onToggleVisited,
}) {
  const dragRef = useRef({ active: false, startY: 0, startFrac: SHEET_MID })
  const [frac, setFrac] = useState(SHEET_MID)

  const onHandleDown = (event) => {
    dragRef.current = {
      active: true,
      startY: event.clientY,
      startFrac: frac,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const onHandleMove = (event) => {
    if (!dragRef.current.active) return
    const dy = event.clientY - dragRef.current.startY
    const vh = window.innerHeight || 800
    // Drag up = sheet grows = frac increases. dy is positive downward.
    const next = clamp(dragRef.current.startFrac - dy / vh, SHEET_MIN, SHEET_MAX)
    setFrac(next)
  }
  const onHandleUp = (event) => {
    dragRef.current.active = false
    if (event?.currentTarget?.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    // Snap to the nearest stop so the sheet always rests in a known pose.
    setFrac((current) => {
      let best = SHEET_STOPS[0]
      let bestDist = Infinity
      for (const stop of SHEET_STOPS) {
        const d = Math.abs(stop - current)
        if (d < bestDist) {
          best = stop
          bestDist = d
        }
      }
      return best
    })
  }

  return (
    <div
      className="cb-sheet"
      style={{ height: `${frac * 100}vh` }}
    >
      <div
        className="cb-sheet-handle"
        onPointerDown={onHandleDown}
        onPointerMove={onHandleMove}
        onPointerUp={onHandleUp}
        onPointerCancel={onHandleUp}
        role="separator"
        aria-label="Resize list"
      >
        <span className="cb-sheet-grip" />
      </div>

      <div className="cb-sheet-search">
        {/* Inline SVG, not U+2315 — the codepoint renders as tofu on some
            Android WebViews even when the system claims symbol coverage. */}
        <svg
          className="cb-sheet-search-icon"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <circle cx="7" cy="7" r="4.5" />
          <line x1="10.5" y1="10.5" x2="13.5" y2="13.5" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search countries"
          aria-label="Search countries"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
      </div>

      <div className="cb-list">
        {countries.length === 0 ? (
          <div className="cb-list-empty">No countries match.</div>
        ) : (
          countries.map((country) => {
            const isVisited = visited.has(country.iso3)
            const isSelected = country.iso3 === selectedIso3
            return (
              <div
                key={country.iso3}
                role="button"
                tabIndex={0}
                aria-label={`Show ${country.displayName} on the globe`}
                className={
                  'cb-row' +
                  (isVisited ? ' cb-row--visited' : '') +
                  (isSelected ? ' cb-row--selected' : '')
                }
                onClick={() => onSelect(country)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onSelect(country)
                  }
                }}
              >
                <span className="cb-row-flag" aria-hidden="true">
                  {country.flag || '🏳️'}
                </span>
                <span className="cb-row-text">
                  <strong>{country.displayName}</strong>
                  <small>
                    {country.region || 'World'}
                    {country.subregion ? ` · ${country.subregion}` : ''}
                  </small>
                </span>
                <button
                  type="button"
                  className={'cb-row-pill' + (isVisited ? ' is-on' : '')}
                  onClick={(event) => {
                    event.stopPropagation()
                    onToggleVisited(country)
                  }}
                  aria-pressed={isVisited}
                  aria-label={isVisited
                    ? `Mark ${country.displayName} as not visited`
                    : `Mark ${country.displayName} as visited`}
                >
                  {isVisited ? 'Been' : 'Mark'}
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// --------------------------------------------------------------------------
// Sync pill — surfaces outbox depth + offline state next to the counter.
// --------------------------------------------------------------------------
// Three observable states, in priority order:
//   pending > 0  → "Offline · N pending" / "Saving · N pending"
//   offline      → "Offline"
//   online + 0   → null (the steady state hides the pill so we don't
//                  clutter the header with "Saved" forever)
// hasRuntime=false means the runtime didn't load (dev/fallback) — writes
// go direct to the server, so there's no outbox to surface. Hide the pill
// in that mode rather than lie about a queue that doesn't exist.
function SyncPill({ online, pending, hasRuntime }) {
  if (!hasRuntime) return null
  if (pending > 0) {
    const label = online
      ? `Saving · ${pending} pending`
      : `Offline · ${pending} pending`
    return (
      <span
        className={'cb-pill cb-pill--pending' + (online ? '' : ' cb-pill--offline')}
        role="status"
        aria-live="polite"
        title="Your changes are saved locally and will sync when you're back online."
      >
        <span className="cb-pill-dot" aria-hidden="true" />
        {label}
      </span>
    )
  }
  if (!online) {
    return (
      <span
        className="cb-pill cb-pill--offline"
        role="status"
        aria-live="polite"
        title="You're offline — taps will sync when you're back online."
      >
        <span className="cb-pill-dot" aria-hidden="true" />
        Offline
      </span>
    )
  }
  return null
}

// --------------------------------------------------------------------------
// App root.
// --------------------------------------------------------------------------
export default function CountriesBeen({ appId, token }) {
  const storage = useMemo(() => makeStorage({ appId, token }), [appId, token])

  const [countries, setCountries] = useState([])
  const [visited, setVisited] = useState(() => new Set())
  const [selectedIso3, setSelectedIso3] = useState('')
  const [query, setQuery] = useState('')
  const [focusRequest, setFocusRequest] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Track online status + outbox depth so the user can see whether their
  // last tap actually reached the server. We poll pendingCount() lazily —
  // once after every set/remove and on a slow 10s interval — rather than
  // subscribing to a runtime event the platform doesn't expose.
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine !== false : true,
  )
  const [pending, setPending] = useState(0)

  // ----- boot ----------------------------------------------------------
  useEffect(() => {
    let active = true
    async function boot() {
      try {
        setLoading(true)
        const [countriesData, visitedData] = await Promise.all([
          storage.get('countries.geo.json'),
          storage.get('visited.json'),
        ])
        if (!active) return
        const list = Array.isArray(countriesData) ? countriesData : []
        setCountries(list)
        setVisited(new Set(Array.isArray(visitedData) ? visitedData : []))
        setError('')
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Countries Been: boot failed', err)
        if (active) setError('Could not load the world right now. Try again in a moment.')
      } finally {
        if (active) setLoading(false)
      }
    }
    boot()
    return () => {
      active = false
    }
  }, [storage])

  // Online/offline tracking. We listen to the browser events directly
  // (the runtime doesn't proxy them) and refresh pending count on each
  // transition so the pill updates immediately when the outbox drains.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const refresh = () => {
      setOnline(navigator.onLine !== false)
      storage.pendingCount().then(setPending).catch(() => {})
    }
    refresh()
    window.addEventListener('online', refresh)
    window.addEventListener('offline', refresh)
    // Slow poll catches drains that happen without a window event (the
    // runtime flushes on focus/visibility too, which don't fire 'online').
    const id = setInterval(refresh, 10000)
    return () => {
      window.removeEventListener('online', refresh)
      window.removeEventListener('offline', refresh)
      clearInterval(id)
    }
  }, [storage])

  // ----- derived list (filtered + sorted) ------------------------------
  const filteredCountries = useMemo(() => {
    const text = soften(query)
    return countries
      .filter((country) => {
        if (!text) return true
        return [
          country.displayName,
          country.name,
          country.region,
          country.subregion,
          country.iso2,
          country.iso3,
        ]
          .filter(Boolean)
          .some((value) => soften(value).includes(text))
      })
      .sort((a, b) => {
        // Visited countries float to the top so the user's collection is
        // always the first thing they see.
        const av = visited.has(a.iso3) ? 1 : 0
        const bv = visited.has(b.iso3) ? 1 : 0
        if (av !== bv) return bv - av
        return a.displayName.localeCompare(b.displayName)
      })
  }, [countries, query, visited])

  const visitedCount = visited.size
  const totalCount = countries.length

  // ----- actions -------------------------------------------------------
  const focusCountry = useCallback((country, duration = PAN_DURATION_MS) => {
    if (!country) return
    setFocusRequest({ iso3: country.iso3, duration, stamp: Date.now() })
  }, [])

  // Optimistic update with rollback. We flip the local Set immediately so
  // the tap feels instant, then revert if storage.set rejects — otherwise
  // the user sees a country glow that the next reload silently undoes.
  //
  // Offline path: storage.set returns {queued:true} (not a rejection), so
  // the rollback only fires on real server errors. A queued write keeps
  // the optimistic state and bumps the pending pill — exactly what we want.
  const toggleVisited = useCallback(
    (country) => {
      if (!country) return
      const previous = visited
      const next = new Set(previous)
      if (next.has(country.iso3)) next.delete(country.iso3)
      else next.add(country.iso3)
      setVisited(next)
      setError('')
      storage
        .set('visited.json', Array.from(next))
        .then(() => {
          // Refresh outbox depth — queued writes bump it, synced writes
          // leave it unchanged (or drain it during a flush we missed).
          storage.pendingCount().then(setPending).catch(() => {})
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error('Countries Been: save failed', err)
          // Rollback to the pre-tap Set so on-screen state matches what's
          // actually persisted.
          setVisited(previous)
          setError(
            `Could not save ${country.displayName} just now — try again in a moment.`,
          )
        })
    },
    [storage, visited],
  )

  // Tap on globe — pan to face the country AND toggle in one motion. This
  // is the headline interaction; a single tap should always make a visible
  // change.
  const onTapCountry = useCallback(
    (country) => {
      setSelectedIso3(country.iso3)
      focusCountry(country)
      toggleVisited(country)
    },
    [focusCountry, toggleVisited],
  )

  // Tap on a list row — pan to face the country, but DON'T toggle (the
  // pill on the row handles toggling). Lets the user scroll through the
  // list and explore without accidentally marking countries.
  const onSelectFromList = useCallback(
    (country) => {
      setSelectedIso3(country.iso3)
      focusCountry(country)
    },
    [focusCountry],
  )

  // ----- render --------------------------------------------------------
  return (
    <div className="cb-app">
      <style>{`
        .cb-app {
          /* Ocean palette is theme-derived so the globe reads as a globe in
             every theme. The base is var(--bg) shaded toward var(--text)
             (so it darkens against light bgs and lifts against dark bgs);
             accent provides the cool tint. */
          --cb-ocean-1: color-mix(in srgb, var(--accent) 28%, color-mix(in srgb, var(--bg) 70%, var(--text) 30%));
          --cb-ocean-2: color-mix(in srgb, var(--accent) 14%, color-mix(in srgb, var(--bg) 55%, var(--text) 45%));
          --cb-ocean-3: color-mix(in srgb, var(--bg) 40%, var(--text) 60%);
          /* Specular shine — a soft white highlight in dark themes, a faint
             accent-tinted halo in light ones (where pure white disappears
             into the page). */
          --cb-shine-1: color-mix(in srgb, white 55%, transparent);
          --cb-shine-2: color-mix(in srgb, white 6%, transparent);
          --cb-shine-3: transparent;
          --cb-surface: color-mix(in srgb, var(--surface) 82%, transparent);
          --cb-surface-strong: color-mix(in srgb, var(--surface2) 92%, transparent);
          --cb-border: var(--border);
          position: fixed;
          inset: 0;
          display: flex;
          flex-direction: column;
          background:
            radial-gradient(120% 80% at 50% 0%, color-mix(in srgb, var(--accent) 18%, transparent), transparent 70%),
            var(--bg);
          color: var(--text);
          font-family: var(--font);
          overflow: hidden;
        }

        .cb-header {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          padding: 14px 18px 8px;
          flex-shrink: 0;
        }
        .cb-header h1 {
          margin: 0;
          font-size: 18px;
          letter-spacing: 0.01em;
          color: var(--text);
        }
        .cb-header h1 span.cb-eyebrow {
          display: block;
          font-size: 11px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--muted);
          font-weight: 500;
          margin-bottom: 2px;
        }
        .cb-header-meta {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .cb-counter {
          display: inline-flex;
          align-items: baseline;
          gap: 4px;
          padding: 6px 12px;
          border-radius: 999px;
          background: var(--cb-surface);
          border: 1px solid var(--cb-border);
          font-variant-numeric: tabular-nums;
        }
        .cb-counter strong {
          font-size: 18px;
          color: var(--accent);
        }
        .cb-counter span {
          color: var(--muted);
          font-size: 13px;
        }
        /* Sync pill — sits next to the counter; hidden when synced + online
           (the common case). When pending > 0 or offline, the pill softly
           announces what state the user's writes are in. */
        .cb-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 5px 10px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.04em;
          border: 1px solid var(--cb-border);
          background: var(--cb-surface);
          color: var(--muted);
          font-variant-numeric: tabular-nums;
        }
        .cb-pill-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--muted);
        }
        .cb-pill--pending .cb-pill-dot {
          background: var(--accent);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
        }
        .cb-pill--offline .cb-pill-dot {
          background: color-mix(in srgb, var(--text) 50%, transparent);
        }

        .cb-globe-shell {
          flex: 1 1 auto;
          min-height: 0;
          position: relative;
        }
        .cb-globe-canvas {
          position: absolute;
          inset: 0;
        }
        .cb-globe-svg {
          width: 100%;
          height: 100%;
          display: block;
        }
        .cb-globe-loading {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          color: var(--muted);
          font-size: 14px;
          text-align: center;
          padding: 0 24px;
        }
        .cb-globe-loading--offline {
          /* Sticks slightly above center so it doesn't overlap the bottom
             sheet's grip on short viewports. */
          align-items: start;
          padding-top: 28%;
        }
        .cb-country {
          fill: color-mix(in srgb, var(--text) 18%, transparent);
          stroke: color-mix(in srgb, var(--text) 30%, transparent);
          stroke-width: 0.5;
          transition: fill 200ms ease, filter 200ms ease;
          cursor: pointer;
        }
        .cb-country:hover {
          fill: color-mix(in srgb, var(--text) 26%, transparent);
        }
        .cb-country--visited {
          fill: var(--accent);
          stroke: color-mix(in srgb, var(--accent) 60%, white);
          stroke-width: 0.6;
          filter:
            drop-shadow(0 0 4px color-mix(in srgb, var(--accent) 70%, transparent))
            drop-shadow(0 0 10px color-mix(in srgb, var(--accent) 40%, transparent));
        }
        .cb-country--selected {
          stroke: white;
          stroke-width: 1.4;
        }

        .cb-error {
          margin: 0 18px 8px;
          padding: 10px 14px;
          border-radius: 12px;
          background: color-mix(in srgb, var(--accent) 12%, transparent);
          color: var(--text);
          border: 1px solid var(--cb-border);
          font-size: 13px;
        }

        .cb-sheet {
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          background: var(--cb-surface-strong);
          backdrop-filter: blur(14px);
          border-top: 1px solid var(--cb-border);
          border-radius: 22px 22px 0 0;
          box-shadow: 0 -10px 30px rgba(0, 0, 0, 0.18);
          min-height: 30vh;
          transition: height 220ms cubic-bezier(.22,1,.36,1);
          overflow: hidden;
        }
        .cb-sheet-handle {
          flex-shrink: 0;
          height: 24px;
          display: grid;
          place-items: center;
          touch-action: none;
          cursor: ns-resize;
        }
        .cb-sheet-grip {
          width: 44px;
          height: 5px;
          border-radius: 999px;
          background: color-mix(in srgb, var(--text) 24%, transparent);
        }
        .cb-sheet-search {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 4px 14px 10px;
          padding: 10px 14px;
          border-radius: 14px;
          background: var(--cb-surface);
          border: 1px solid var(--cb-border);
          color: var(--muted);
        }
        .cb-sheet-search-icon {
          flex-shrink: 0;
          display: block;
          color: var(--muted);
        }
        .cb-sheet-search input {
          flex: 1;
          background: transparent;
          border: 0;
          outline: 0;
          color: var(--text);
          font: inherit;
        }
        .cb-sheet-search input::placeholder {
          color: var(--muted);
        }

        .cb-list {
          flex: 1 1 auto;
          min-height: 0;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 0 12px 18px;
          -webkit-overflow-scrolling: touch;
        }
        .cb-list-empty {
          padding: 24px;
          text-align: center;
          color: var(--muted);
          font-size: 14px;
        }
        .cb-row {
          width: 100%;
          display: grid;
          grid-template-columns: 30px 1fr auto;
          align-items: center;
          gap: 12px;
          padding: 10px 12px;
          margin-bottom: 6px;
          border: 1px solid transparent;
          border-radius: 14px;
          background: color-mix(in srgb, var(--surface) 60%, transparent);
          color: var(--text);
          font: inherit;
          text-align: left;
          cursor: pointer;
          transition: background 160ms ease, border-color 160ms ease, transform 160ms ease;
        }
        .cb-row:hover {
          background: color-mix(in srgb, var(--surface2) 80%, transparent);
        }
        .cb-row--selected {
          border-color: color-mix(in srgb, var(--accent) 60%, transparent);
          background: color-mix(in srgb, var(--accent) 8%, var(--surface));
        }
        .cb-row-flag {
          font-size: 22px;
          line-height: 1;
        }
        .cb-row-text strong {
          display: block;
          font-size: 15px;
          font-weight: 600;
        }
        .cb-row-text small {
          display: block;
          margin-top: 2px;
          font-size: 12px;
          color: var(--muted);
        }
        .cb-row-pill {
          /* iOS HIG says 44×44pt minimum. The pill is still visually a pill
             (smaller text, rounded ends); the height comes from min-height
             and the width from min-width + symmetric padding. */
          min-width: 64px;
          min-height: 44px;
          padding: 0 14px;
          border-radius: 999px;
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.02em;
          background: color-mix(in srgb, var(--surface2) 90%, transparent);
          color: var(--muted);
          border: 1px solid var(--cb-border);
          cursor: pointer;
          user-select: none;
          transition: background 160ms ease, color 160ms ease, transform 120ms ease;
        }
        .cb-row-pill:active {
          transform: scale(0.96);
        }
        .cb-row-pill.is-on {
          background: var(--accent);
          color: var(--bg);
          border-color: var(--accent);
        }
        .cb-row--visited .cb-row-text strong {
          color: var(--accent);
        }

        @media (min-height: 760px) {
          .cb-header h1 { font-size: 20px; }
        }

        /* Wide screen: the bottom sheet doesn't really make sense, but
           since this is mobile-first we keep the layout consistent and
           just let the sheet sit at the bottom. The globe gets a bit of
           breathing room. */
        @media (min-width: 720px) {
          .cb-header {
            padding: 18px 24px 10px;
          }
        }
      `}</style>

      <header className="cb-header">
        <h1>
          <span className="cb-eyebrow">Countries Been</span>
          {visitedCount === 0
            ? 'Tap a country.'
            : visitedCount === 1
            ? '1 down, the rest of the world to go.'
            : `${visitedCount} stamps on the map.`}
        </h1>
        <div className="cb-header-meta">
          <SyncPill online={online} pending={pending} hasRuntime={storage.hasRuntime} />
          <div className="cb-counter" aria-label={`${visitedCount} of ${totalCount} countries visited`}>
            <strong>{visitedCount}</strong>
            <span>/ {totalCount || '…'}</span>
          </div>
        </div>
      </header>

      {error ? (
        <div className="cb-error" role="alert" aria-live="polite">
          {error}
        </div>
      ) : null}

      <div className="cb-globe-shell">
        {loading ? (
          <div className="cb-globe-loading">Loading the world…</div>
        ) : (
          <Globe
            countries={countries}
            visited={visited}
            selectedIso3={selectedIso3}
            focusRequest={focusRequest}
            onTapCountry={onTapCountry}
          />
        )}
      </div>

      <BottomSheet
        countries={filteredCountries}
        visited={visited}
        selectedIso3={selectedIso3}
        query={query}
        onQueryChange={setQuery}
        onSelect={onSelectFromList}
        onToggleVisited={toggleVisited}
      />
    </div>
  )
}
