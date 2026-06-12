import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// --------------------------------------------------------------------------
// Storage shim — probe runtime on every call, fall back to fetch on miss.
// --------------------------------------------------------------------------
// The Möbius offline runtime exposes window.mobius.storage. It can be
// injected AFTER the app boots (the shell installs it post-mount on some
// paths), so caching `native` at construction time wedges every later call
// into the direct-fetch path even when the runtime is alive. Other apps
// (app-gym, notes, habits) all probe at call time — we follow that pattern.
//
// Each method also falls back to fetch when the runtime is present but
// throws — a single bad runtime call shouldn't poison the rest of the
// session.
function makeStorage({ appId, token }) {
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

  async function set(path, data) {
    const native = probe()
    if (native && typeof native.set === 'function') {
      try {
        return await native.set(path, data)
      } catch {
        // fall through to direct PUT
      }
    }
    const r = await fetch(`${base}/${path}`, {
      method: 'PUT',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!r.ok) throw new Error(`storage set ${path}: ${r.status}`)
    return { synced: true }
  }

  // pendingCount surfaces the runtime outbox depth. Returns 0 when there
  // is no runtime (no outbox to surface).
  async function pendingCount() {
    const native = probe()
    if (native && typeof native.pendingCount === 'function') {
      try {
        return await native.pendingCount()
      } catch {
        return 0
      }
    }
    return 0
  }

  // hasRuntime is a *probe*, not a cached boolean — readers call it when
  // they need a fresh answer (the SyncPill uses it on every render).
  function hasRuntime() {
    return !!probe()
  }

  return { get, set, pendingCount, hasRuntime }
}

// --------------------------------------------------------------------------
// Helpers.
// --------------------------------------------------------------------------
const soften = (value) => String(value || '').toLowerCase().trim()
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const cubicOut = (t) => 1 - Math.pow(1 - t, 3)

// Versor (unit-quaternion) helpers for "grab the surface" dragging. A fixed
// deg/px drag can't track the surface: on an orthographic globe the same
// finger travel sweeps a different angle depending on zoom, viewport size,
// and where on the sphere you grabbed (the limb foreshortens). Versor maths
// solves the rotation that carries the point first grabbed to the point now
// under the pointer, so the surface stays glued to the finger everywhere.
// Ported from Mike Bostock's `versor` (ISC) — kept inline so the app needs no
// extra runtime dep beyond d3-geo (which is already gated for offline).
const DEG2RAD = Math.PI / 180
const RAD2DEG = 180 / Math.PI
// [lng, lat]° → unit vector on the sphere.
const versorCartesian = (e) => {
  const l = e[0] * DEG2RAD
  const p = e[1] * DEG2RAD
  const cp = Math.cos(p)
  return [cp * Math.cos(l), cp * Math.sin(l), Math.sin(p)]
}
// Euler rotation [λ, φ, γ]° → quaternion.
const versorFromAngles = (e) => {
  const l = (e[0] / 2) * DEG2RAD
  const sl = Math.sin(l)
  const cl = Math.cos(l)
  const p = (e[1] / 2) * DEG2RAD
  const sp = Math.sin(p)
  const cp = Math.cos(p)
  const g = (e[2] / 2) * DEG2RAD
  const sg = Math.sin(g)
  const cg = Math.cos(g)
  return [
    cl * cp * cg + sl * sp * sg,
    sl * cp * cg - cl * sp * sg,
    cl * sp * cg + sl * cp * sg,
    cl * cp * sg - sl * sp * cg,
  ]
}
// Quaternion → Euler rotation [λ, φ, γ]°.
const versorToAngles = (q) => [
  Math.atan2(2 * (q[0] * q[1] + q[2] * q[3]), 1 - 2 * (q[1] * q[1] + q[2] * q[2])) * RAD2DEG,
  Math.asin(Math.max(-1, Math.min(1, 2 * (q[0] * q[2] - q[3] * q[1])))) * RAD2DEG,
  Math.atan2(2 * (q[0] * q[3] + q[1] * q[2]), 1 - 2 * (q[2] * q[2] + q[3] * q[3])) * RAD2DEG,
]
// Quaternion of the shortest rotation carrying unit vector v0 → v1.
const versorDelta = (v0, v1) => {
  const w = [
    v0[1] * v1[2] - v0[2] * v1[1],
    v0[2] * v1[0] - v0[0] * v1[2],
    v0[0] * v1[1] - v0[1] * v1[0],
  ]
  const l = Math.sqrt(w[0] * w[0] + w[1] * w[1] + w[2] * w[2])
  if (!l) return [1, 0, 0, 0]
  const dot = v0[0] * v1[0] + v0[1] * v1[1] + v0[2] * v1[2]
  const t = Math.acos(Math.max(-1, Math.min(1, dot))) / 2
  const s = Math.sin(t)
  return [Math.cos(t), (w[2] / l) * s, (-w[1] / l) * s, (w[0] / l) * s]
}
// Hamilton product q0·q1 (compose two rotations).
const versorMultiply = (q0, q1) => [
  q0[0] * q1[0] - q0[1] * q1[1] - q0[2] * q1[2] - q0[3] * q1[3],
  q0[0] * q1[1] + q0[1] * q1[0] + q0[2] * q1[3] - q0[3] * q1[2],
  q0[0] * q1[2] - q0[1] * q1[3] + q0[2] * q1[0] + q0[3] * q1[1],
  q0[0] * q1[3] + q0[1] * q1[2] - q0[2] * q1[1] + q0[3] * q1[0],
]

// Pixel distance between the first two live pointers in a pointer Map. The
// pinch gesture is driven entirely by how this distance changes, so it
// lives in one named place rather than inline in the move handler.
function pinchSpread(pointers) {
  const [a, b] = [...pointers.values()]
  return Math.hypot(a.x - b.x, a.y - b.y)
}

// Initial rotation — Western Europe slightly above the equator. Easier to
// recognize than 0,0 (which puts the user in the Atlantic).
const INITIAL_ROTATION = [12, -22, 0]
// Time-delta based idle spin — degrees per *second*, not per frame, so
// 120Hz devices don't spin twice as fast as 60Hz ones. ~2.1 deg/s ≈ the
// previous 0.035 deg/frame at 60Hz.
const IDLE_SPIN_DEG_PER_SEC = 2.1
const PAN_DURATION_MS = 950
export const ROTATION_SINGULARITY_LAT = 84.5

// Zoom — a multiplier on the size-derived base radius (1 = the default
// "fits the canvas" globe). Kept as a multiplier, not an absolute pixel
// scale, so it survives a resize: the bottom sheet dragging up shrinks the
// base radius but the user's chosen zoom level rides along unchanged.
// MIN < 1 lets the user pull back for a fuller sphere; MAX caps the zoom-in
// before country borders turn to mush. To change the zoom range, edit these
// two — every gesture (pinch, wheel, +/- buttons, keyboard) clamps to them.
const MIN_ZOOM = 0.75
const MAX_ZOOM = 6
// Each +/- button press (and keyboard +/-) steps the zoom by this factor.
// 1.4× per step ≈ 5 presses to cross the whole range, which feels like
// "a few taps" rather than a slow crawl.
const ZOOM_STEP = 1.4

const isRotationSingular = (rotation) => Math.abs(rotation?.[1] || 0) >= ROTATION_SINGULARITY_LAT
const clampDragLatitude = (lat) => clamp(lat, -ROTATION_SINGULARITY_LAT, ROTATION_SINGULARITY_LAT)
export const nextDragRotation = (current, lng, lat) => {
  const nextLat = clampDragLatitude(lat)
  if (isRotationSingular(current) && Math.abs(nextLat) >= ROTATION_SINGULARITY_LAT) {
    return null
  }
  return [lng, nextLat, 0]
}

// localStorage cache keys — the offline runtime caches storage.get reads
// but cold-reload-without-runtime needs *some* local mirror or the boot
// screen shows nothing forever. We mirror atlas + countries on every
// successful read; the boot path consults the cache first if the network
// read returns null. Scoped by appId so two installs don't collide. The
// legacy `visited-app:` prefix preserves offline cache across the Visited
// -> Atlas rename.
export const CACHE_KEY = (appId, name) => `atlas-app:${appId}:${name}`
export const LEGACY_CACHE_KEY = (appId, name) => `visited-app:${appId}:${name}`

export function cacheRead(appId, name) {
  if (typeof localStorage === 'undefined') return null
  try {
    const key = CACHE_KEY(appId, name)
    const legacyKey = LEGACY_CACHE_KEY(appId, name)
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw)
    const legacyRaw = localStorage.getItem(legacyKey)
    if (!legacyRaw) return null
    const value = JSON.parse(legacyRaw)
    try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
    return value
  } catch {
    return null
  }
}

export function cacheWrite(appId, name, data) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(CACHE_KEY(appId, name), JSON.stringify(data))
  } catch {
    // Quota or private-mode — silent; cache is a nice-to-have.
  }
}

// Dedupe a country list by iso3, keeping the first occurrence. The
// bundled GeoJSON ships duplicate entries for CYP / GUF / SOM, which
// (a) inflates the total count, and (b) produces duplicate React keys.
// We log a warning so the dupe doesn't go silent if the seed ever changes.
function dedupeCountries(list) {
  if (!Array.isArray(list)) return []
  const seen = new Set()
  const out = []
  const dupes = []
  for (const c of list) {
    const iso3 = c?.iso3
    if (!iso3) continue
    if (seen.has(iso3)) {
      dupes.push(iso3)
      continue
    }
    seen.add(iso3)
    out.push(c)
  }
  if (dupes.length) {
    // eslint-disable-next-line no-console
    console.warn('Atlas: dropped duplicate iso3 entries from seed', dupes)
  }
  return out
}

function toIsoSet(values) {
  if (values instanceof Set) return new Set([...values].filter(Boolean))
  if (Array.isArray(values)) return new Set(values.filter(Boolean))
  return new Set()
}

export function orderCountriesForList(countries, visitedValues = new Set(), wishlistValues = new Set(), query = '') {
  if (!Array.isArray(countries)) return []
  const visitedSet = toIsoSet(visitedValues)
  const wishlistSet = toIsoSet(wishlistValues)
  const text = soften(query)
  const rank = (country) => {
    if (visitedSet.has(country?.iso3)) return 0
    if (wishlistSet.has(country?.iso3)) return 1
    return 2
  }
  return countries
    .filter((country) => {
      if (!country || typeof country !== 'object') return false
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
      const ar = rank(a)
      const br = rank(b)
      if (ar !== br) return ar - br
      const an = String(a.displayName || a.name || a.iso3 || '')
      const bn = String(b.displayName || b.name || b.iso3 || '')
      const nameOrder = an.localeCompare(bn)
      if (nameOrder !== 0) return nameOrder
      return String(a.iso3 || '').localeCompare(String(b.iso3 || ''))
    })
}

export function toggleCountryStatus(visitedValues, wishlistValues, iso3, status) {
  const visitedSet = toIsoSet(visitedValues)
  const wishlistSet = toIsoSet(wishlistValues)
  if (!iso3) return { visited: visitedSet, wishlist: wishlistSet }
  if (status === 'visited') {
    if (visitedSet.has(iso3)) visitedSet.delete(iso3)
    else {
      visitedSet.add(iso3)
      wishlistSet.delete(iso3)
    }
  } else if (status === 'wishlist') {
    if (wishlistSet.has(iso3)) wishlistSet.delete(iso3)
    else {
      wishlistSet.add(iso3)
      visitedSet.delete(iso3)
    }
  }
  return { visited: visitedSet, wishlist: wishlistSet }
}

// d3-geo treats a polygon's interior as the side to the LEFT of its ring
// winding. A ring wound the wrong way makes d3-geo fill the entire
// complement — a whole-hemisphere disc. Reversing every ring flips the
// winding back. Used by `normalizedCountries` to repair inverted features
// (the source GeoJSON ships Bermuda's outer ring counter-clockwise).
function reverseWinding(geometry) {
  const flip = (rings) => rings.map((ring) => ring.slice().reverse())
  if (geometry.type === 'Polygon') {
    return { ...geometry, coordinates: flip(geometry.coordinates) }
  }
  if (geometry.type === 'MultiPolygon') {
    return { ...geometry, coordinates: geometry.coordinates.map(flip) }
  }
  return geometry
}

// --------------------------------------------------------------------------
// Globe — orthographic d3-geo projection on an SVG canvas.
// --------------------------------------------------------------------------
function Globe({
  countries,
  visited,
  wishlist,
  selectedIso3,
  focusRequest,
  onTapCountry,
  onTapOcean,
}) {
  const containerRef = useRef(null)
  const d3Ref = useRef(null)
  const animationRef = useRef(0)
  const idleRef = useRef(0)
  const idleLastTickRef = useRef(0)
  const dragRef = useRef({
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    startRotate: INITIAL_ROTATION.slice(),
  })
  const rotationRef = useRef(INITIAL_ROTATION.slice())
  // pinchRef holds the in-flight two-finger gesture. While active it owns
  // the globe: drag-rotate and idle spin both stand down (they check
  // pinchRef.current.active) so the two gestures never fight over rotation.
  const pinchRef = useRef({ active: false, startDist: 0, startZoom: 1 })
  // Live pointer positions keyed by pointerId. A single entry = drag; a
  // second entry promotes the gesture to a pinch. This is the one place
  // that knows "how many fingers are down".
  const pointersRef = useRef(new Map())
  const zoomRef = useRef(1)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [rotation, setRotation] = useState(INITIAL_ROTATION.slice())
  // zoom is a multiplier on the base radius; see MIN_ZOOM/MAX_ZOOM. Held in
  // both a ref (read synchronously by gesture handlers) and state (drives
  // the re-render) the same way rotation is — setZoomBoth keeps them in sync.
  const [zoom, setZoom] = useState(1)
  const [ready, setReady] = useState(false)
  // depFailed used to be sticky for the rest of the session — a single
  // hiccupping import (e.g. SW updating mid-flight) blanked the globe
  // until full reload. Now it's paired with a counter that retries on
  // every reconnect (see the useEffect listening for window 'online').
  const [depAttempt, setDepAttempt] = useState(0)
  const [depFailed, setDepFailed] = useState(false)

  // d3-geo lives at runtime — declared in manifest.runtime.esm_deps so the
  // install UI warns the user. Bundle suffix flattens the dep graph into a
  // single ES module so esm.sh doesn't ship a waterfall of small chunks.
  // A 5s timeout races the import so an offline cold-start can't hang on
  // the fetch indefinitely. depAttempt is in the dep array so the
  // reconnect retry below can force another attempt.
  useEffect(() => {
    let active = true
    const timeoutMs = 5000
    let timeoutId = 0
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('d3-geo load timed out')), timeoutMs)
    })
    setDepFailed(false)
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
  }, [depAttempt])

  // When the browser reconnects, retry the d3-geo import if it failed.
  // The offline copy at esm.sh will land via the SW cache; this just kicks
  // the effect to actually try.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const retry = () => {
      if (!d3Ref.current) setDepAttempt((n) => n + 1)
    }
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
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

  // The single owner of "current zoom". Clamps to [MIN_ZOOM, MAX_ZOOM] so no
  // caller has to remember the bounds, then writes the ref (read by gesture
  // handlers) and state (drives the projection) together.
  const setZoomBoth = useCallback((next) => {
    const safe = Number.isFinite(next) && next > 0 ? next : zoomRef.current
    const clamped = clamp(safe, MIN_ZOOM, MAX_ZOOM)
    zoomRef.current = clamped
    setZoom(clamped)
  }, [])

  // Multiply the current zoom by a factor — the shape every input speaks
  // (pinch ratio, wheel notch, +/- step). Multiplicative so a step feels
  // the same whether you're zoomed in or out, and so it stays symmetric:
  // factor f then 1/f returns you exactly where you started.
  const zoomBy = useCallback(
    (factor) => {
      if (!Number.isFinite(factor) || factor <= 0) return
      setZoomBoth(zoomRef.current * factor)
    },
    [setZoomBoth],
  )

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
        if (t < 1) {
          animationRef.current = requestAnimationFrame(step)
        } else {
          // Clear the rAF id on completion. The idle-spin loop reads
          // animationRef.current === 0 as "no focus-pan running"; leaving
          // the last frame's id in place permanently freezes the idle spin
          // after the first pan.
          animationRef.current = 0
        }
      }
      animationRef.current = requestAnimationFrame(step)
    },
    [setRotationBoth],
  )

  // Repair inverted-winding features once d3-geo is loaded. Some source
  // features (here: Bermuda) ship an outer ring wound the wrong way; d3-geo
  // then fills the whole hemisphere for that feature, which both paints a
  // giant disc AND — because each country path is the tap target — swallows
  // every globe tap (the "tapping the globe selects Bermuda" bug). geoArea
  // > 2π is the signature of an inverted feature; rewind it. Memoized so the
  // ~180 area checks run once per data/d3-ready change, not per render. Used
  // for both rendering and focus so the centroid is correct too.
  const normalizedCountries = useMemo(() => {
    const d3 = d3Ref.current
    if (!d3) return countries
    const FULL_SPHERE = 2 * Math.PI
    const areaOf = (geometry) =>
      d3.geoArea({ type: 'Feature', properties: {}, geometry })
    return countries.map((c) => {
      let geometry = c.geometry
      // A single corrupt sub-polygon — a near-zero-area / degenerate ring —
      // makes d3-geo report the WHOLE feature as spanning >2π; it then fills the
      // entire front hemisphere and (each country path being its own tap target)
      // swallows every globe tap. A real country sub-polygon never spans more
      // than a hemisphere on its own, so drop any that does. Guards the render
      // against bad dataset geometry (a rebuild once shipped such a ring for
      // Russia) without discarding the whole country.
      if (geometry?.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
        const kept = geometry.coordinates.filter(
          (poly) => areaOf({ type: 'Polygon', coordinates: poly }) <= FULL_SPHERE
        )
        if (kept.length && kept.length !== geometry.coordinates.length) {
          geometry = { ...geometry, coordinates: kept }
        }
      }
      // Genuine inverted winding (e.g. Bermuda) still fills the hemisphere after
      // the drop above; rewind the whole feature so d3 fills its interior.
      return areaOf(geometry) > FULL_SPHERE
        ? { ...c, geometry: reverseWinding(geometry) }
        : { ...c, geometry }
    })
  }, [countries, ready])

  // Paint the selected country last. SVG stacks in document order, so a
  // selected feature drawn early gets its highlight glow overpainted along
  // every border it shares with a later-drawn neighbor. Reordering only the
  // render keeps the list/tab order story simple (React moves the keyed <g>,
  // hit-testing is unaffected — fills tile, so nothing new occludes a tap).
  const renderCountries = useMemo(() => {
    if (!selectedIso3) return normalizedCountries
    const selected = normalizedCountries.find((c) => c.iso3 === selectedIso3)
    if (!selected) return normalizedCountries
    return [...normalizedCountries.filter((c) => c.iso3 !== selectedIso3), selected]
  }, [normalizedCountries, selectedIso3])

  // Smooth-pan when the parent asks us to focus a particular country.
  useEffect(() => {
    if (!ready || !focusRequest?.iso3 || !d3Ref.current) return
    const country = normalizedCountries.find((c) => c.iso3 === focusRequest.iso3)
    if (!country) return
    const [lng, lat] = d3Ref.current.geoCentroid({
      type: 'Feature',
      properties: {},
      geometry: country.geometry,
    })
    animateTo([-lng, -lat, 0], focusRequest.duration ?? PAN_DURATION_MS)
  }, [animateTo, normalizedCountries, focusRequest, ready])

  // Idle spin — runs every frame except during user drag or focus pan.
  // Honors prefers-reduced-motion: vestibular users see a still globe by
  // default, and the focus-pan animation still works because that's
  // user-initiated. We advance by elapsed time (not by a constant per
  // frame) so the spin speed is the same on 60Hz and 120Hz displays.
  useEffect(() => {
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) return
    cancelAnimationFrame(idleRef.current)
    idleLastTickRef.current = 0
    const loop = (now) => {
      const last = idleLastTickRef.current || now
      const dt = Math.min(100, now - last) / 1000 // cap dt at 100ms to avoid jumps after a tab-switch
      idleLastTickRef.current = now
      if (!dragRef.current.active && !pinchRef.current.active) {
        // Skip idle motion while an explicit focus pan is animating so we
        // don't fight it. animationRef.current is the rAF id; zero = idle.
        if (!animationRef.current || animationRef.current === 0) {
          const [lng, lat, gamma] = rotationRef.current
          setRotationBoth([lng + IDLE_SPIN_DEG_PER_SEC * dt, lat, gamma])
        }
      }
      idleRef.current = requestAnimationFrame(loop)
    }
    idleRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(idleRef.current)
  }, [setRotationBoth])

  useEffect(() => () => cancelAnimationFrame(animationRef.current), [])

  // Re-compute projection on every rotation/zoom/size change.
  const projectionData = useMemo(() => {
    if (!ready || !d3Ref.current || !size.width || !size.height) return null
    const d3 = d3Ref.current
    // Base radius — 46% of the smaller dim fits the default globe with a
    // comfortable margin. zoom (a multiplier) scales it; the radius below is
    // the *visible* radius, so the halo/sphere geometry tracks the zoom too.
    const radius = Math.min(size.width, size.height) * 0.46 * zoom
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
  }, [ready, rotation, zoom, size.height, size.width])

  // ----- pointer drag + pinch-zoom -------------------------------------
  // One finger rotates; a second finger promotes the gesture to a pinch
  // that zooms (and suspends rotation). The pointer count in pointersRef is
  // the single source of truth for which mode we're in.

  // Re-seat the drag baseline at the leftover pointer's current position so
  // rotation continues from where the finger is — without this, lifting one
  // finger after a pinch would snap the globe by the accumulated delta.
  const reseatDrag = (pointer) => {
    dragRef.current = {
      active: true,
      moved: true, // a pinch happened; never treat the lift-off as a tap
      startX: pointer.x,
      startY: pointer.y,
      startRotate: rotationRef.current.slice(),
      // Re-grab the versor baseline on the next move (see onPointerMove).
      v0: null,
      q0: null,
      offSphere: false,
    }
  }

  const onPointerDown = (event) => {
    event.currentTarget.blur?.()
    cancelAnimationFrame(animationRef.current)
    animationRef.current = 0
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    event.currentTarget.setPointerCapture?.(event.pointerId)
    if (pointersRef.current.size >= 2) {
      // Second finger down — enter pinch. Drag stands down (and is flagged
      // moved so the gesture can't end in a tap); idle spin pauses on
      // pinchRef.active.
      dragRef.current.active = false
      dragRef.current.moved = true
      pinchRef.current = {
        active: true,
        startDist: pinchSpread(pointersRef.current) || 1,
        startZoom: zoomRef.current,
      }
    } else {
      dragRef.current = {
        active: true,
        moved: false,
        startX: event.clientX,
        startY: event.clientY,
        startRotate: rotationRef.current.slice(),
        // Versor baseline (grab point as a unit vector + the rotation-at-grab
        // as a quaternion) is captured on the first move, once we have the
        // pointer's position relative to the SVG.
        v0: null,
        q0: null,
        offSphere: false,
      }
    }
  }

  const onPointerMove = (event) => {
    const pointer = pointersRef.current.get(event.pointerId)
    if (pointer) {
      pointer.x = event.clientX
      pointer.y = event.clientY
    }
    if (pinchRef.current.active) {
      // Zoom tracks the spread ratio so the pinch feels anchored to the
      // fingers: spread the same factor the globe scaled by. setZoomBoth
      // clamps, so over-pinching past the bounds simply rests at the limit.
      const spread = pinchSpread(pointersRef.current)
      setZoomBoth((pinchRef.current.startZoom * spread) / pinchRef.current.startDist)
      return
    }
    if (!dragRef.current.active) return
    const dx = event.clientX - dragRef.current.startX
    const dy = event.clientY - dragRef.current.startY
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragRef.current.moved = true

    // Versor drag: solve the rotation that carries the point first grabbed to
    // the point now under the pointer, so the surface stays glued to the finger
    // at any zoom, viewport, and latitude. (A fixed deg/px slips — the same
    // finger travel sweeps a different angle as the on-screen radius and the
    // limb foreshortening change, which is why dragging never felt like the
    // earth's surface.) Falls back to a radius-scaled deg/px when d3 isn't
    // ready or the grab/pointer lands off the sphere.
    const d3 = d3Ref.current
    const drag = dragRef.current
    if (d3 && projectionData && !drag.offSphere) {
      const rect = event.currentTarget.getBoundingClientRect()
      const px = event.clientX - rect.left
      const py = event.clientY - rect.top
      const projectionAt = (rot) =>
        d3
          .geoOrthographic()
          .translate([size.width / 2, size.height / 2])
          .scale(projectionData.radius)
          .clipAngle(90)
          .rotate(rot)
      // Capture the grab baseline on the first move of the gesture (and after
      // a pinch hands control back). A grab that lands off the sphere marks the
      // gesture linear so we stop retrying the invert.
      if (!drag.v0) {
        const grab = projectionAt(rotationRef.current).invert([px, py])
        if (grab && Number.isFinite(grab[0]) && Number.isFinite(grab[1])) {
          drag.startRotate = rotationRef.current.slice()
          drag.v0 = versorCartesian(grab)
          drag.q0 = versorFromAngles(drag.startRotate)
        } else {
          drag.offSphere = true
        }
      }
      if (drag.v0) {
        const here = projectionAt(drag.startRotate).invert([px, py])
        if (here && Number.isFinite(here[0]) && Number.isFinite(here[1])) {
          const q = versorMultiply(drag.q0, versorDelta(drag.v0, versorCartesian(here)))
          const [lng, lat, roll] = versorToAngles(q)
          // Past a pole the versor decode folds latitude back down (asin's
          // [-90,90] range) and the roll flips toward ±180° — the globe then
          // appears to reverse and spin the wrong way. A large roll means the
          // drag tried to cross the pole; hold the last good rotation so the
          // vertical drag stays bounded by the N/S poles (the upright feel the
          // picker wants) instead of flipping past them. nextDragRotation's
          // ±84.5 clamp can't catch this because the folded latitude lands back
          // inside the clamp band.
          if (Math.abs(roll) > 90) return
          const next = nextDragRotation(rotationRef.current, lng, lat)
          if (!next) return
          // Keep north up (zero roll, clamp the pole): idle spin and
          // country-focus both assume an upright axis, and a free-tilting
          // globe reads as broken in a country picker.
          setRotationBoth(next)
        }
        // Pointer past the limb this frame → hold the last good rotation.
        return
      }
    }

    // Fallback: radius-scaled deg/px — exact at the globe centre for any zoom
    // and viewport. Used while d3 loads, or when the grab was off the sphere
    // (e.g. on the surrounding glow), where versor has no anchor.
    const degPerPx = projectionData ? RAD2DEG / projectionData.radius : 0.4 / zoomRef.current
    const [startLng, startLat] = drag.startRotate
    const next = nextDragRotation(rotationRef.current, startLng + dx * degPerPx, startLat - dy * degPerPx)
    if (next) setRotationBoth(next)
  }

  const finishDrag = (event) => {
    pointersRef.current.delete(event.pointerId)
    if (event?.currentTarget?.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (pinchRef.current.active) {
      if (pointersRef.current.size >= 2) {
        // Still pinching with a different pair — re-seat the baseline so the
        // zoom doesn't jump when the contributing fingers change.
        pinchRef.current.startDist = pinchSpread(pointersRef.current) || 1
        pinchRef.current.startZoom = zoomRef.current
        return
      }
      // Dropped out of pinch. If one finger remains, hand control back to
      // drag-rotate from its current spot; otherwise the gesture is over.
      pinchRef.current.active = false
      const [leftover] = [...pointersRef.current.values()]
      if (leftover) {
        reseatDrag(leftover)
        return
      }
    }
    if (pointersRef.current.size > 0) return // other fingers still down
    dragRef.current.active = false

    // Tap means select — never zoom. A double-tap zoom used to live here
    // and it hijacked country selection (rapid taps read as zoom); pinch,
    // wheel, and the keyboard +/- are the zoom surface.

    // Defer the moved flag so onClick (which fires after pointerup) still
    // sees moved=true and skips the tap when the user was dragging.
    setTimeout(() => {
      dragRef.current.moved = false
    }, 0)
  }
  const onPointerUp = (event) => finishDrag(event)
  const onPointerCancel = (event) => finishDrag(event)
  // Route pointer-leave through finishDrag so we always release capture
  // and clear the moved flag — earlier this just flipped active=false
  // and left the moved flag dangling, which could swallow the next tap.
  const onPointerLeave = (event) => finishDrag(event)
  // Some browsers fire lostpointercapture without a paired pointerup
  // (e.g. iOS Safari when a modal overlays mid-drag). Treat that as a
  // drag finish so we don't get stuck with dragRef.active=true.
  const onLostPointerCapture = (event) => finishDrag(event)

  // Wheel / trackpad zoom on desktop. Exponential in deltaY so each notch is
  // a constant proportional change (and the clamp behaves the same near both
  // ends). passive:false isn't available on React's synthetic onWheel, but
  // touchAction:none on the SVG already stops the page from scrolling under
  // a trackpad pinch.
  const onWheel = (event) => {
    event.preventDefault()
    const delta = clamp(event.deltaY || 0, -600, 600)
    zoomBy(Math.exp(-delta * 0.0015))
  }

  // Keyboard zoom — +/- (and =, the unshifted +) when the globe has focus.
  // Cheap a11y win: zoom without a pointer at all.
  const onKeyDown = (event) => {
    if (event.key === '+' || event.key === '=') {
      event.preventDefault()
      zoomBy(ZOOM_STEP)
    } else if (event.key === '-') {
      event.preventDefault()
      zoomBy(1 / ZOOM_STEP)
    }
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
          tabIndex={0}
          aria-label="Globe — drag to spin, pinch or +/- to zoom"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onPointerLeave={onPointerLeave}
          onLostPointerCapture={onLostPointerCapture}
          onWheel={onWheel}
          onKeyDown={onKeyDown}
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

          {/* Outer accent halo. Radius shrunk from 1.06× to 1.02× so the
             blur (stdDeviation 16) doesn't leak past the SVG edge on
             short layouts; the glow now feels like it belongs to the
             globe rather than the container. */}
          <circle
            cx={size.width / 2}
            cy={size.height / 2}
            r={projectionData.radius * 1.02}
            fill="var(--accent)"
            opacity="0.14"
            filter="url(#cb-glow)"
          />

          {/* Ocean sphere — stroke derives from --text so the rim stays
             visible on light themes (where pure-white would vanish).
             Tapping the ocean clears selection (so the user can return
             to the unfiltered list without hunting for the close X). */}
          <path
            d={projectionData.path({ type: 'Sphere' })}
            fill="url(#cb-ocean)"
            stroke="color-mix(in srgb, var(--text) 22%, transparent)"
            strokeWidth="1"
            onClick={() => {
              if (dragRef.current.moved) return
              onTapOcean?.()
            }}
            style={{ cursor: 'pointer' }}
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
             and hover tooltips surface the name on desktop. tabIndex and
             a keyboard handler make small-country selection reachable
             without a sub-pixel tap. */}
          {renderCountries.map((country) => {
            const d = projectionData.path({
              type: 'Feature',
              properties: {},
              geometry: country.geometry,
            })
            if (!d) return null
            const isVisited = visited.has(country.iso3)
            const isWishlisted = wishlist.has(country.iso3)
            const isSelected = country.iso3 === selectedIso3
            const label = isVisited
              ? `${country.displayName} — visited`
              : isWishlisted
                ? `${country.displayName} — want to visit`
              : country.displayName
            return (
              <g
                key={country.iso3}
                role="button"
                tabIndex={0}
                aria-label={label}
                onClick={(event) => {
                  event.currentTarget.blur?.()
                  if (dragRef.current.moved) return
                  onTapCountry(country)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onTapCountry(country)
                  }
                }}
              >
                <title>{label}</title>
                <path
                  d={d}
                  className={
                    'cb-country' +
                    (isVisited ? ' cb-country--visited' : '') +
                    (isWishlisted ? ' cb-country--wishlist' : '') +
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
            opacity="0.18"
            pointerEvents="none"
          />
        </svg>
      )}

      {/* Zoom is driven by wheel/trackpad, pinch, and the +/- keys (see the
         gesture handlers + onKeyDown). The on-screen +/- buttons were removed
         so the globe surface is uncluttered — scroll/pinch to zoom is the
         expected gesture and the keyboard path keeps it accessible. */}
    </div>
  )
}

// --------------------------------------------------------------------------
// Bottom sheet — vertically draggable list + search.
// --------------------------------------------------------------------------
const SHEET_MIN = 0.30  // 30% of viewport — collapsed
const SHEET_MID = 0.50  // 50% — neutral
const SHEET_MAX = 0.80  // 80% — expanded
const SHEET_STOPS_DEFAULT = [SHEET_MIN, SHEET_MID, SHEET_MAX]

function BottomSheet({
  countries,
  visited,
  wishlist,
  selectedCountry,
  query,
  onQueryChange,
  onSelect,
  onToggleVisited,
  onToggleWishlist,
  onDeselect,
}) {
  const dragRef = useRef({ active: false, startY: 0, startFrac: SHEET_MID, fromBody: false })
  const [frac, setFrac] = useState(SHEET_MID)
  const [dragging, setDragging] = useState(false)
  const scrollRef = useRef(null)

  const minFrac = SHEET_MIN
  const stops = SHEET_STOPS_DEFAULT

  // Drag math reused by both the handle and the body. dragRef.startFrac
  // captures the sheet height at gesture start; dy is converted to a
  // frac delta using visualViewport.height so a soft keyboard doesn't
  // skew the math. We use visualViewport for *both* the displayed sheet
  // height (CSS percent of the visual viewport) and the drag conversion
  // so the user's finger and the sheet edge stay aligned.
  const startDrag = (event, fromBody) => {
    dragRef.current = {
      active: true,
      fromBody,
      startY: event.clientY,
      startFrac: frac,
    }
    setDragging(true)
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const moveDrag = (event) => {
    if (!dragRef.current.active) return
    const dy = event.clientY - dragRef.current.startY
    const rawVh =
      (typeof window !== 'undefined' && window.visualViewport?.height) ||
      window.innerHeight ||
      800
    const vh = Number.isFinite(rawVh) && rawVh > 120 ? rawVh : 800
    // Drag up = sheet grows = frac increases. dy is positive downward.
    const next = clamp(dragRef.current.startFrac - dy / vh, minFrac, SHEET_MAX)
    setFrac(next)
  }
  const endDrag = (event) => {
    dragRef.current.active = false
    setDragging(false)
    if (event?.currentTarget?.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    // Snap to the nearest legal stop so the sheet always rests in a known
    // pose, preserving the user's chosen height across list/detail modes.
    setFrac((current) => {
      let best = stops[0]
      let bestDist = Infinity
      for (const stop of stops) {
        const d = Math.abs(stop - current)
        if (d < bestDist) {
          best = stop
          bestDist = d
        }
      }
      return best
    })
  }

  const onHandleDown = (event) => startDrag(event, false)
  const onHandleMove = moveDrag
  const onHandleUp = endDrag
  // lostpointercapture pairs with the same teardown — without this the
  // sheet can wedge in mid-drag after iOS Safari yanks capture.
  const onHandleLost = endDrag

  // The body of the sheet (list / detail) accepts drag-down too — but
  // only when the inner scroller is at the top. If the user is scrolling
  // a long list, we want native scroll; if they're at the top and pull
  // further, we treat that as a sheet drag.
  const onBodyDown = (event) => {
    const atTop = (scrollRef.current?.scrollTop || 0) <= 0
    if (!atTop) return
    startDrag(event, true)
  }
  const onBodyMove = (event) => {
    if (!dragRef.current.active || !dragRef.current.fromBody) return
    // If the user dragged UP from the top, prefer native scroll over
    // sheet expansion — release the drag.
    const dy = event.clientY - dragRef.current.startY
    if (dy < -8) {
      endDrag(event)
      return
    }
    moveDrag(event)
  }
  const onBodyUp = (event) => {
    if (dragRef.current.active && dragRef.current.fromBody) endDrag(event)
  }

  const isVisitedSelected = selectedCountry && visited.has(selectedCountry.iso3)
  const isWishlistedSelected = selectedCountry && wishlist.has(selectedCountry.iso3)

  return (
    <div
      className={'cb-sheet' + (dragging ? ' cb-sheet--dragging' : '')}
      style={{ height: `${frac * 100}%` }}
    >
      <div
        className="cb-sheet-handle"
        onPointerDown={onHandleDown}
        onPointerMove={onHandleMove}
        onPointerUp={onHandleUp}
        onPointerCancel={onHandleUp}
        onLostPointerCapture={onHandleLost}
        role="separator"
        aria-label="Resize sheet"
      >
        <span className="cb-sheet-grip" />
      </div>

      {/* Detail panel and list are ALWAYS mounted so the list's scrollTop is
          preserved by the DOM when the user goes back. CSS hides the inactive
          panel; the scroll container never unmounts, never resets to 0. */}
      <div
        className={'cb-detail' + (selectedCountry ? '' : ' cb-detail--hidden')}
        role="region"
        aria-label="Country detail"
        aria-hidden={!selectedCountry}
      >
        {selectedCountry && (
          <>
            <div className="cb-detail-head">
              <span className="cb-detail-flag" aria-hidden="true">
                {selectedCountry.flag || '🏳️'}
              </span>
              <div className="cb-detail-name">
                <strong>{selectedCountry.displayName}</strong>
                <small>
                  {selectedCountry.region || 'World'}
                  {selectedCountry.subregion ? ` · ${selectedCountry.subregion}` : ''}
                </small>
              </div>
              <button
                type="button"
                className="cb-detail-close"
                onClick={onDeselect}
                aria-label="Close country detail"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 18 18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <line x1="4" y1="4" x2="14" y2="14" />
                  <line x1="14" y1="4" x2="4" y2="14" />
                </svg>
              </button>
            </div>

            <div className="cb-detail-actions">
              <button
                type="button"
                className={'cb-detail-cta cb-detail-cta--visited' + (isVisitedSelected ? ' is-on' : '')}
                onClick={() => onToggleVisited(selectedCountry)}
                aria-pressed={isVisitedSelected}
              >
                {isVisitedSelected ? 'Visited' : 'Mark visited'}
              </button>
              <button
                type="button"
                className={'cb-detail-cta cb-detail-cta--wishlist' + (isWishlistedSelected ? ' is-on' : '')}
                onClick={() => onToggleWishlist(selectedCountry)}
                aria-pressed={isWishlistedSelected}
              >
                {isWishlistedSelected ? 'Wishlisted' : 'Want to visit'}
              </button>
            </div>
          </>
        )}
      </div>

      <div className={'cb-list-panel' + (selectedCountry ? ' cb-list-panel--hidden' : '')}>
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
          {query ? (
            <button
              type="button"
              className="cb-sheet-search-clear"
              onClick={() => onQueryChange('')}
              aria-label="Clear search"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <line x1="3" y1="3" x2="11" y2="11" />
                <line x1="11" y1="3" x2="3" y2="11" />
              </svg>
            </button>
          ) : null}
        </div>

        <div
          className="cb-list"
          ref={scrollRef}
          onPointerDown={onBodyDown}
          onPointerMove={onBodyMove}
          onPointerUp={onBodyUp}
          onPointerCancel={onBodyUp}
          onLostPointerCapture={onBodyUp}
        >
          {countries.length === 0 ? (
            <div className="cb-list-empty">No countries match.</div>
          ) : (
            countries.map((country) => {
              const isVisited = visited.has(country.iso3)
              const isWishlisted = wishlist.has(country.iso3)
              return (
                <div
                  key={country.iso3}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open ${country.displayName}`}
                  className={
                    'cb-row' +
                    (isVisited ? ' cb-row--visited' : '') +
                    (isWishlisted ? ' cb-row--wishlist' : '')
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
                  {isWishlisted && !isVisited ? (
                    <span
                      className="cb-row-badge cb-row-badge--wishlist"
                      aria-label="Want to visit"
                      title="Want to visit"
                    >
                      ·
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className={'cb-row-mark' + (isVisited ? ' cb-row-mark--on' : '')}
                    aria-label={isVisited
                      ? `Mark ${country.displayName} not visited`
                      : `Mark ${country.displayName} visited`}
                    aria-pressed={isVisited}
                    title={isVisited ? 'Visited — tap to unmark' : 'Tap to mark visited'}
                    onClick={(event) => {
                      event.stopPropagation()
                      onToggleVisited(country)
                    }}
                  >
                    <span aria-hidden="true">{isVisited ? '✓' : ''}</span>
                  </button>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

// --------------------------------------------------------------------------
// Sync pill — surfaces offline state next to the counter.
// --------------------------------------------------------------------------
// Only the offline state is surfaced. Local saves are instant and reliable;
// outbox depth ("Saving · N pending") is internal plumbing the owner doesn't
// need to read. Online → null (clean steady state).
// hasRuntime=false means the runtime didn't load (dev/fallback) — writes
// go direct to the server, so there's no outbox to surface. Hide the pill
// in that mode rather than lie about a queue that doesn't exist.
function SyncPill({ online, hasRuntime }) {
  if (!hasRuntime) return null
  if (online) return null
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

// --------------------------------------------------------------------------
// App root.
// --------------------------------------------------------------------------
// Nav state machine — selection -> nav-push -> ack races used to leave
// phantom history entries when the user closed the detail before the ACK
// landed. Now: selection in IDLE issues a push and transitions to PUSHING;
// the ACK promotes PUSHING -> OPEN; the shell's nav-back returns OPEN ->
// IDLE; user-initiated close from PUSHING is recorded so the late ACK
// auto-pops; from OPEN it issues nav-pop and goes POPPING.
const NAV_IDLE = 'idle'
const NAV_PUSHING = 'pushing'
const NAV_OPEN = 'open'
const NAV_POPPING = 'popping'

// ----------------------------------------------------------------- styles ---

const CSS = `
/* mobius-ui:NativeTouch v1 — keep in sync; library candidate. Diverge below the marker only. */
* { -webkit-tap-highlight-color: transparent; }
.cb-sheet-handle, .cb-detail-cta, .cb-detail-close, .cb-sheet-search-clear, .cb-row {
  touch-action: manipulation;
}
.cb-header, .cb-counter, .cb-pill, .cb-detail-flag, .cb-row-flag {
  user-select: none; -webkit-user-select: none;
}
.cb-detail-close:active { transform: scale(0.94); }
.cb-list { overscroll-behavior: contain; }
.cb-detail { overscroll-behavior: contain; }
.cb-sheet-search input { font-size: 16px; }
@media (hover: hover) {
  .cb-country:hover { fill: var(--cb-land-hover); }
  .cb-row:hover {
    background: color-mix(in srgb, var(--surface2, var(--surface)) 80%, transparent);
  }
  .cb-sheet-search-clear:hover { color: var(--text); }
  .cb-detail-close:hover {
    background: var(--surface2, var(--surface));
    color: var(--text);
  }
}
/* /mobius-ui:NativeTouch */

/* mobius-ui:Focus v1 -- shared keyboard focus ring (WCAG 2.4.7); never bare outline:none */
:where(button,a,input,textarea,select,summary,[role="button"],[tabindex]:not([tabindex="-1"])):focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
/* /mobius-ui:Focus */

/* mobius-ui:Root v1 — keep in sync; library candidate. Diverge below the marker only. */
.cb-app {
  /* mobius-ui:identity-palette — DELIBERATE divergence. The ocean blue is
     an atlas-identity color the theme tokens can't express; it keeps a
     stable atlas identity while mixing in the active theme background so
     standalone installs and shell embeds do not feel like different apps.
     Keep these hardcoded hex; everything else rides the theme tokens. */
  --cb-ocean-1: color-mix(in srgb, #3f8cff 88%, var(--bg) 12%);
  --cb-ocean-2: color-mix(in srgb, #1764c7 92%, var(--bg) 8%);
  --cb-ocean-3: color-mix(in srgb, #0b2f73 94%, var(--bg) 6%);
  /* /mobius-ui:identity-palette */
  /* Specular shine — a soft highlight. Mixing with literal white
     read OK on dark themes but flat-out vanished into the page on
     light ones; mix toward --bg so the highlight sits one shade
     lighter than the underlying surface in every theme. The
     accent tint keeps the globe feeling planet-shaped rather
     than just paler-than-its-frame. */
  --cb-shine-1: color-mix(in srgb, #ffffff 38%, transparent);
  --cb-shine-2: color-mix(in srgb, #ffffff 12%, transparent);
  --cb-shine-3: transparent;
  --cb-surface: color-mix(in srgb, var(--surface) 82%, transparent);
  /* --surface2 isn't guaranteed by every Möbius theme; fall back
     to --surface so the sheet stays solid on themes that don't
     define the deeper surface token. */
  --cb-surface-strong: color-mix(in srgb, var(--surface2, var(--surface)) 92%, transparent);
  --cb-border: var(--border);
  --cb-land-fill: color-mix(in srgb, #d7c49a 72%, var(--surface) 28%);
  --cb-land-hover: color-mix(in srgb, #e5d4aa 78%, var(--text) 22%);
  --cb-land-stroke: color-mix(in srgb, #24333b 74%, var(--bg) 26%);
  /* Visited rides the theme's semantic --green (falls back to a stable
     green on themes that don't define it) so "visited" tracks per-theme
     accent shifts instead of pinning one hardcoded hue. */
  --cb-visited-base: var(--green, #27ae60);
  --cb-visited-fill: color-mix(in srgb, var(--cb-visited-base) 88%, var(--cb-land-fill) 12%);
  --cb-visited-stroke: color-mix(in srgb, #d9ffe7 72%, var(--bg) 28%);
  --cb-wishlist: color-mix(in srgb, #f39c12 88%, var(--cb-land-fill) 12%);
  --cb-wishlist-fill: color-mix(in srgb, var(--cb-wishlist) 82%, var(--cb-land-fill) 18%);
  /* Selected fill: the theme accent brightened with literal white — NOT
     --text, which flips dark on light themes and would read as shadow
     instead of highlight. The white lift keeps it clearly lighter than
     the visited green even on themes whose accent is itself green. */
  --cb-selected-fill: color-mix(in srgb, var(--accent) 72%, #ffffff 28%);
  --cb-active-cta-text: #101820;
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

.cb-error {
  margin: 0 18px 8px;
  padding: 10px 14px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--text);
  border: 1px solid var(--cb-border);
  font-size: 13px;
}
.cb-banner {
  margin: 0 18px 8px;
  padding: 8px 14px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface) 70%, transparent);
  border: 1px solid var(--cb-border);
  color: var(--muted);
  font-size: 12px;
  line-height: 1.4;
}
/* /mobius-ui:Root */

/* mobius-ui:Header v1 — keep in sync; library candidate. Diverge below the marker only. */
.cb-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  /* Top-pinned bar: clear the notch / status bar on phones. */
  padding: max(14px, env(safe-area-inset-top)) 18px 8px;
  flex-shrink: 0;
}
.cb-header h1 {
  margin: 0;
  font-size: 18px;
  letter-spacing: 0.01em;
  color: var(--text);
  min-width: 0;
  line-height: 1.15;
}
/* Atlas's signature header: an uppercase letter-spaced eyebrow above a
   changing sentence ("12 stamps on the map."). Intentional divergence
   from the canonical brand-mark + title + subtitle Header shape; kept as
   the app's identity. */
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
  flex: 0 0 auto;
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
    padding: max(18px, env(safe-area-inset-top)) 24px 10px;
  }
}
@media (max-width: 430px) {
  .cb-header {
    align-items: center;
    padding: max(12px, env(safe-area-inset-top)) 14px 8px;
  }
  .cb-header h1 {
    font-size: 16px;
  }
  .cb-counter {
    padding: 5px 9px;
  }
  .cb-counter-pct {
    display: none;
  }
}
/* /mobius-ui:Header */

/* mobius-ui:SyncPill v1 — keep in sync; library candidate. Diverge below the marker only. */
.cb-counter {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  padding: 6px 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--cb-surface) 88%, var(--bg) 12%);
  border: 1px solid var(--cb-border);
  /* Derived stats render in --mono to match how sibling apps set
     numeric/metadata chips. */
  font-family: var(--mono);
  font-variant-numeric: tabular-nums;
  transition: opacity 200ms ease;
}
.cb-counter--faded {
  /* When we boot offline with no cached GeoJSON, the totals are
     unknown — fade the counter so the user doesn't read a
     confidently-stated "0 / …" as fact. */
  opacity: 0.55;
}
.cb-counter strong {
  font-size: 18px;
  color: var(--accent);
}
.cb-counter span {
  color: var(--muted);
  font-size: 13px;
}
.cb-counter-pct {
  /* Share of the world visited. Divider + accent tint so it reads as
     a derived stat, not another raw count. */
  margin-left: 6px;
  padding-left: 8px;
  border-left: 1px solid var(--cb-border);
  color: color-mix(in srgb, var(--accent) 85%, var(--text));
  font-size: 13px;
  font-weight: 600;
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
  /* Metadata chip: --mono + tabular-nums so the pending count reads as a
     derived stat, matching sibling apps. */
  font-family: var(--mono);
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
/* /mobius-ui:SyncPill */

/* mobius-ui:Globe v1 — keep in sync; library candidate. Diverge below the marker only. */
.cb-globe-shell {
  flex: 1 1 auto;
  min-height: 0;
  position: relative;
}
.cb-globe-canvas {
  position: absolute;
  inset: 0;
  /* touch-action:none on the container div prevents the shell zoom-lock
     from eating pinch gestures before the SVG's own touchAction:none
     takes effect — important during the first render frame. */
  touch-action: none;
}
.cb-globe-svg {
  width: 100%;
  height: 100%;
  display: block;
}
/* Suppress the outline only for mouse/touch focus; the shared Focus
   block below still paints a ring for keyboard (:focus-visible) users. */
.cb-globe-svg:focus:not(:focus-visible) {
  outline: none;
}
.cb-globe-svg g[role='button']:focus:not(:focus-visible) {
  outline: none;
}
/* The focused country may sit near or behind the limb where a thin
   stroke is easy to miss — pair a thick accent stroke with a
   non-scaling accent halo so keyboard focus is unmistakable. */
.cb-globe-svg g[role='button']:focus-visible {
  outline: none;
}
.cb-globe-svg g[role='button']:focus-visible .cb-country {
  stroke: var(--accent);
  stroke-width: 2.2;
  filter: drop-shadow(0 0 4px color-mix(in srgb, var(--accent) 70%, transparent));
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
  fill: var(--cb-land-fill);
  stroke: var(--cb-land-stroke);
  stroke-width: 0.62;
  opacity: 1;
  transition: fill 180ms ease, stroke 180ms ease, filter 180ms ease;
  cursor: pointer;
}
.cb-country--visited {
  fill: var(--cb-visited-fill);
  /* Stroke previously mixed accent with literal "white", which
     vanished the outline on light themes. Mix with --bg so the
     border keeps separation from the ocean in every theme. */
  stroke: var(--cb-visited-stroke);
  stroke-width: 0.74;
  filter:
    drop-shadow(0 0 3px color-mix(in srgb, var(--cb-visited-base) 58%, transparent))
    drop-shadow(0 0 8px color-mix(in srgb, #102f3a 44%, transparent));
}
.cb-country--wishlist {
  fill: var(--cb-wishlist-fill);
  stroke: color-mix(in srgb, var(--cb-wishlist) 70%, var(--bg) 30%);
  stroke-width: 0.74;
}
.cb-country--selected {
  /* Selection highlights the TERRITORY, never its boundary. A stroke-based
     highlight can't work here: each country is one path, but countries
     paint in document order, so a neighbor drawn later overpaints the half
     of the selection stroke that falls on its side of a shared border (and
     redraws its own dark stroke on top) — the white outline showed up
     broken wherever the selected country touched land. A fill can't be
     overpainted (polygons tile), and because the whole MultiPolygon is one
     path keyed by iso3 the fill covers every island and exclave too.
     The country keeps its normal boundary stroke (land/visited/wishlist);
     only the fill changes. Overrides visited/wishlist fill so the
     selection is always unambiguous — the CTA state in the detail panel
     shows the visited/wishlist status instead. */
  fill: var(--cb-selected-fill);
  /* Accent glow hugs the filled territory so even one-pixel islands pop;
     it follows the shape, not the border, so it reads as "this landmass is
     lit", not as another outline. */
  filter: drop-shadow(0 0 3px color-mix(in srgb, var(--accent) 70%, transparent))
          drop-shadow(0 0 7px color-mix(in srgb, var(--accent) 40%, transparent));
}
/* /mobius-ui:Globe */

/* mobius-ui:Sheet v1 — keep in sync; library candidate. Diverge below the marker only. */
.cb-sheet {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--cb-surface-strong);
  backdrop-filter: blur(14px);
  border-top: 1px solid var(--cb-border);
  border-radius: 22px 22px 0 0;
  /* Neutral elevation shadow — same in light + dark themes; the
     color-mix tint comes from the surface underneath. */
  box-shadow: 0 -10px 30px color-mix(in srgb, var(--text) 18%, transparent);
  /* Snap animations only — drag updates set the dragging class
     which disables the transition so the sheet tracks the finger
     without a perceived lag. */
  transition: height 220ms cubic-bezier(.22,1,.36,1);
  overflow: hidden;
  /* min-height previously used vh which conflicted with the
     percent-of-cb-app inline height during keyboard-up; drop
     the min entirely — SHEET_MIN (0.30) already enforces the
     floor in code. */
}
.cb-sheet--dragging {
  transition: none;
}
.cb-sheet-handle {
  /* 44px tap target — the grip itself stays visually small but
     the surrounding hit area is finger-friendly. */
  flex-shrink: 0;
  height: 44px;
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
  color: var(--text);
  font: inherit;
}
/* Keep the borderless look for mouse focus; the shared Focus block
   still paints a keyboard ring on :focus-visible. */
.cb-sheet-search input:focus:not(:focus-visible) {
  outline: 0;
}
.cb-sheet-search input::placeholder {
  color: var(--muted);
}
.cb-sheet-search-clear {
  flex-shrink: 0;
  min-width: 28px;
  min-height: 28px;
  display: grid;
  place-items: center;
  padding: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  border: 0;
  cursor: pointer;
}
/* /mobius-ui:Sheet */

/* mobius-ui:Card v1 — keep in sync; library candidate. Diverge below the marker only. */
/* Detail panel and list panel sit in the same flex slot. Exactly one
   is visible at a time; the other is display:none so it takes no space
   but stays mounted — this is the mechanism that preserves scrollTop on
   the list without any JS save/restore logic. */
.cb-detail--hidden,
.cb-list-panel--hidden {
  display: none !important;
}
.cb-list-panel {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}
/* Detail view — shown while a country is selected. Big flag, name,
   region, primary CTAs, close X. Kept mounted at all times so that
   toggling back to the list never resets its scroll position. */
.cb-detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
  /* Bottom-most surface: keep the CTAs clear of the home indicator
     / gesture bar on notched phones. */
  padding: 4px 18px max(24px, env(safe-area-inset-bottom));
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
.cb-detail-head {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 14px;
}
.cb-detail-flag {
  font-size: 40px;
  line-height: 1;
}
.cb-detail-name strong {
  display: block;
  font-size: 20px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.2;
}
.cb-detail-name small {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--muted);
  letter-spacing: 0.02em;
}
.cb-detail-close {
  min-width: 44px;
  min-height: 44px;
  display: grid;
  place-items: center;
  padding: 0;
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface2, var(--surface)) 80%, transparent);
  color: var(--muted);
  border: 1px solid var(--cb-border);
  cursor: pointer;
  transition: background 160ms ease, color 160ms ease, transform 120ms ease;
}
.cb-detail-cta {
  min-height: 44px;
  padding: 0 14px;
  border-radius: 14px;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.01em;
  background: color-mix(in srgb, var(--surface2, var(--surface)) 88%, transparent);
  color: var(--text);
  border: 1px solid var(--cb-border);
  cursor: pointer;
  transition: transform 120ms ease, background 160ms ease, color 160ms ease;
}
.cb-detail-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 10px;
}
.cb-detail-cta:active {
  transform: scale(0.985);
}
.cb-detail-cta--visited.is-on {
  background: var(--cb-visited-fill);
  color: var(--cb-active-cta-text);
  border-color: var(--cb-visited-fill);
}
.cb-detail-cta--wishlist.is-on {
  background: var(--cb-wishlist);
  color: var(--cb-active-cta-text);
  border-color: var(--cb-wishlist);
}
.cb-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  /* Bottom-most surface: keep the last row clear of the home
     indicator / gesture bar on notched phones. */
  padding: 0 12px max(18px, env(safe-area-inset-bottom));
  -webkit-overflow-scrolling: touch;
}
.cb-list-empty {
  padding: 24px;
  text-align: center;
  color: var(--muted);
  font-size: 14px;
}
.cb-row {
  /* Min-height enforces a 44px tap target without needing to
     pad the row visually — the grid keeps content centred. */
  width: 100%;
  min-height: 56px;
  display: grid;
  grid-template-columns: 30px 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 8px 14px;
  margin-bottom: 6px;
  border: 1px solid transparent;
  border-radius: 14px;
  background: color-mix(in srgb, var(--surface) 60%, transparent);
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 160ms ease, border-color 160ms ease, transform 120ms ease;
}
.cb-row:active {
  transform: scale(0.995);
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
.cb-row-badge {
  /* Accent-tinted check — only shown when the country is visited.
     Pure decoration; the row click opens detail where the actual
     toggle lives. */
  min-width: 28px;
  height: 28px;
  padding: 0 8px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: color-mix(in srgb, var(--cb-visited-fill) 20%, transparent);
  color: var(--cb-visited-fill);
  font-size: 14px;
  font-weight: 700;
}
.cb-row-badge--wishlist {
  background: color-mix(in srgb, var(--cb-wishlist) 18%, transparent);
  color: var(--cb-wishlist);
}
.cb-row-chevron {
  color: var(--muted);
  font-size: 22px;
  line-height: 1;
  padding-right: 4px;
}
/* One-tap visited toggle on each list row: mark a country without opening
   its detail (tap stops propagation). 40px hit target around a 26px ring;
   fills accent with a check when visited. The owner's core flow is bulk-
   marking 195 countries, so this turns "row → detail → mark → back" into a
   single tap. */
.cb-row-mark {
  flex: 0 0 auto;
  width: 40px;
  height: 40px;
  margin: -8px -4px -8px 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: 0;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  color: var(--cb-visited-fill, var(--accent));
}
.cb-row-mark > span {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 2px solid var(--border);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  line-height: 1;
  transition: background 0.12s, border-color 0.12s, transform 0.08s;
}
.cb-row-mark--on > span {
  background: var(--cb-visited-fill, var(--accent));
  border-color: var(--cb-visited-fill, var(--accent));
  color: var(--bg);
}
.cb-row-mark:active > span { transform: scale(0.88); }
@media (hover: hover) {
  .cb-row-mark:hover > span { border-color: var(--cb-visited-fill, var(--accent)); }
}
.cb-row--visited .cb-row-text strong {
  color: var(--cb-visited-fill);
}
.cb-row--wishlist {
  border-color: color-mix(in srgb, var(--cb-wishlist) 22%, transparent);
  background: color-mix(in srgb, var(--cb-wishlist) 8%, var(--surface));
}
.cb-row--wishlist .cb-row-text strong {
  color: var(--cb-wishlist);
}
/* /mobius-ui:Card */

/* mobius-ui:Scrollskin v1 — keep in sync; library candidate. Slim
   token-colored scrollbar so desktop/web doesn't fall back to the raw
   OS default the mobile-first layout otherwise shows on wide screens. */
.cb-list, .cb-detail {
  scrollbar-width: thin;
  scrollbar-color: var(--cb-border) transparent;
}
.cb-list::-webkit-scrollbar, .cb-detail::-webkit-scrollbar {
  width: 9px;
}
.cb-list::-webkit-scrollbar-track, .cb-detail::-webkit-scrollbar-track {
  background: transparent;
}
.cb-list::-webkit-scrollbar-thumb, .cb-detail::-webkit-scrollbar-thumb {
  background: var(--cb-border);
  border-radius: 999px;
  border: 2px solid transparent;
  background-clip: padding-box;
}
/* /mobius-ui:Scrollskin */

/* mobius-ui:ReducedMotion v1 -- honor the OS reduce-motion setting */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
/* /mobius-ui:ReducedMotion */
`

export default function Atlas({ appId, token }) {
  const storage = useMemo(() => makeStorage({ appId, token }), [appId, token])

  const [countries, setCountries] = useState([])
  const [visited, setVisited] = useState(() => new Set())
  const [wishlist, setWishlist] = useState(() => new Set())
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
  // Distinguishes "fetched empty list" from "couldn't fetch at all". When
  // offline, storage.get returns null; the boot path flips this flag so we
  // can render an "offline — using last-known state" banner instead of
  // pretending the world has zero countries.
  const [offlineBoot, setOfflineBoot] = useState(false)
  // Did we manage to render anything for the user? Drives the offline banner
  // copy — "showing your last visited list" only when we actually have one.
  const [hasCachedVisited, setHasCachedVisited] = useState(false)

  // ----- boot ----------------------------------------------------------
  // boot() lives outside the effect so we can re-run it from the online
  // listener below — offline cold-reload that later connects shouldn't be
  // stuck on the empty state forever.
  const bootInFlightRef = useRef(false)
  const boot = useCallback(async () => {
    if (bootInFlightRef.current) return
    bootInFlightRef.current = true
    try {
      setLoading(true)
      // Promise.allSettled, not Promise.all — when only one side fails we
      // still want to keep the side that succeeded (Promise.all discards
      // both on any failure, which used to wipe the visited list when the
      // countries fetch hiccupped).
      const [countriesResult, visitedResult, wishlistResult] = await Promise.allSettled([
        storage.get('countries.geo.json'),
        storage.get('visited.json'),
        storage.get('wishlist.json'),
      ])
      const rawCountries =
        countriesResult.status === 'fulfilled' ? countriesResult.value : null
      const rawVisited =
        visitedResult.status === 'fulfilled' ? visitedResult.value : null
      const rawWishlist =
        wishlistResult.status === 'fulfilled' ? wishlistResult.value : null

      // Countries: prefer fresh, fall back to local cache, dedupe by iso3.
      const cachedCountries = cacheRead(appId, 'countries.geo.json')
      const freshCountries = Array.isArray(rawCountries) ? rawCountries : null
      const countriesList = dedupeCountries(freshCountries || cachedCountries || [])
      setCountries(countriesList)
      if (freshCountries) cacheWrite(appId, 'countries.geo.json', freshCountries)

      // Visited countries: prefer fresh, fall back to local cache.
      const cachedVisited = cacheRead(appId, 'visited.json')
      const freshVisited = Array.isArray(rawVisited) ? rawVisited : null
      const visitedList = freshVisited || cachedVisited || []
      const cachedWishlist = cacheRead(appId, 'wishlist.json')
      const freshWishlist = Array.isArray(rawWishlist) ? rawWishlist : null
      const wishlistList = freshWishlist || cachedWishlist || []
      let nextVisited = new Set(visitedList)
      let nextWishlist = new Set(wishlistList.filter((iso3) => !nextVisited.has(iso3)))
      // Don't clobber in-progress offline toggles. If the runtime outbox
      // still has unsynced writes (pendingCount > 0), the server copy we
      // just read is older than the user's local taps — replacing state
      // with it would wipe visited/wishlist toggles made while offline.
      // Union the server set with the local in-progress sets instead, with
      // visited winning over wishlist (the same exclusivity the toggles use).
      let unsynced = 0
      try {
        unsynced = await storage.pendingCount()
      } catch {
        unsynced = 0
      }
      if (unsynced > 0) {
        nextVisited = new Set([...nextVisited, ...latestVisitedRef.current])
        nextWishlist = new Set(
          [...nextWishlist, ...latestWishlistRef.current].filter((iso3) => !nextVisited.has(iso3)),
        )
      }
      setVisited(nextVisited)
      setWishlist(nextWishlist)
      latestVisitedRef.current = nextVisited
      latestWishlistRef.current = nextWishlist
      // Mirror the state we actually set (the unioned set when we preserved
      // in-progress toggles), not the raw server copy — otherwise the next
      // cold start would read a cache that's missing the offline toggles.
      if (freshVisited) cacheWrite(appId, 'visited.json', Array.from(nextVisited))
      if (freshWishlist) cacheWrite(appId, 'wishlist.json', Array.from(nextWishlist))
      setHasCachedVisited((freshVisited || cachedVisited || []).length > 0)

      // If we ended up with zero countries AND the network is offline, the
      // banner is honest: "offline, here's what we cached". If we have
      // countries (from cache or net), no banner.
      const isOffline =
        typeof navigator !== 'undefined' && navigator.onLine === false
      setOfflineBoot(countriesList.length === 0 && isOffline)

      if (countriesList.length === 0 && !isOffline) {
        // Online but we got nothing — flag a real error so the user knows
        // to try again instead of staring at an empty globe.
        setError('Could not load the world right now. Try again in a moment.')
      } else {
        setError('')
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Atlas:boot failed', err)
      setError('Could not load the world right now. Try again in a moment.')
    } finally {
      setLoading(false)
      bootInFlightRef.current = false
    }
  }, [appId, storage])

  useEffect(() => {
    boot().catch(() => {})
  }, [boot])

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

  // ----- derived list (filtered + sorted) ------------------------------
  const filteredCountries = useMemo(() => {
    return orderCountriesForList(countries, visited, wishlist, query)
  }, [countries, query, visited, wishlist])

  const visitedCount = visited.size
  const totalCount = countries.length

  // ----- actions -------------------------------------------------------
  const focusCountry = useCallback((country, duration = PAN_DURATION_MS) => {
    if (!country) return
    setFocusRequest({ iso3: country.iso3, duration, stamp: Date.now() })
  }, [])

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

  // ----- serialized save queue ----------------------------------------
  // The whole-list PUT model means rapid taps on different countries used
  // to fire parallel PUTs; tap B could land before tap A, then A's
  // rollback wiped B's correct value (or vice versa). We now serialize
  // PUTs through a single in-flight Promise — every save waits its turn.
  // Pending writes coalesce on the LATEST visited/wishlist Sets (last-writer-wins),
  // which is exactly the "merge multiple taps into one PUT" behaviour
  // the user expects when they're rapid-firing through Europe.
  const saveChainRef = useRef(Promise.resolve())
  const latestVisitedRef = useRef(visited)
  const latestWishlistRef = useRef(wishlist)
  useEffect(() => {
    latestVisitedRef.current = visited
  }, [visited])
  useEffect(() => {
    latestWishlistRef.current = wishlist
  }, [wishlist])
  // Coalesce flag — if multiple taps land while one PUT is in flight, we
  // only kick off ONE follow-up PUT (using the latest visited Set) when
  // the in-flight one settles.
  const pendingSaveRef = useRef(false)

  const queueSave = useCallback(
    (countryForErr) => {
      // Mark a follow-up; if a save was already pending, no need to add
      // another link — the existing tail will pick up latestVisitedRef.
      if (pendingSaveRef.current) return
      pendingSaveRef.current = true
      saveChainRef.current = saveChainRef.current
        .catch(() => {}) // swallow prior errors so the chain keeps moving
        .then(async () => {
          pendingSaveRef.current = false
          const visitedSnapshot = Array.from(latestVisitedRef.current)
          const wishlistSnapshot = Array.from(latestWishlistRef.current)
          try {
            await storage.set('visited.json', visitedSnapshot)
            await storage.set('wishlist.json', wishlistSnapshot)
            cacheWrite(appId, 'visited.json', visitedSnapshot)
            cacheWrite(appId, 'wishlist.json', wishlistSnapshot)
            storage.pendingCount().then(setPending).catch(() => {})
          } catch (err) {
            // eslint-disable-next-line no-console
            console.error('Atlas:save failed', err)
            // We can't safely "roll back" here because the user has likely
            // toggled OTHER countries in the meantime — restoring a stale
            // snapshot would clobber their newer taps. Instead surface an
            // error; the next online tick will re-sync from the server.
            setError(
              countryForErr
                ? `Could not save ${countryForErr.displayName} just now — try again in a moment.`
                : 'Could not save your changes just now — try again in a moment.',
            )
          }
        })
    },
    [appId, storage],
  )

  // Optimistic toggle: flip the local Set immediately so the toggle feels
  // instant, then queue a save against the LATEST state. We do NOT roll
  // back per-tap because rapid taps would fight each other on rollback —
  // see queueSave for the error-handling rationale.
  const toggleVisited = useCallback(
    (country) => {
      if (!country) return
      setError('')
      const { visited: nextVisited, wishlist: nextWishlist } = toggleCountryStatus(
        latestVisitedRef.current,
        latestWishlistRef.current,
        country.iso3,
        'visited',
      )
      latestVisitedRef.current = nextVisited
      latestWishlistRef.current = nextWishlist
      setVisited(nextVisited)
      setWishlist(nextWishlist)
      queueSave(country)
    },
    [queueSave],
  )

  const toggleWishlist = useCallback(
    (country) => {
      if (!country) return
      setError('')
      const { visited: nextVisited, wishlist: nextWishlist } = toggleCountryStatus(
        latestVisitedRef.current,
        latestWishlistRef.current,
        country.iso3,
        'wishlist',
      )
      latestVisitedRef.current = nextVisited
      latestWishlistRef.current = nextWishlist
      setVisited(nextVisited)
      setWishlist(nextWishlist)
      queueSave(country)
    },
    [queueSave],
  )

  // Tap on globe OR list row — select + open detail view. NEVER
  // toggles. The detail view's primary CTA is the only path to commit
  // a visited/not-visited change.
  const selectCountry = useCallback(
    (country) => {
      if (!country) return
      setSelectedIso3(country.iso3)
      navPush()
    },
    [navPush],
  )

  const selectedCountry = useMemo(
    () => (selectedIso3 ? countries.find((c) => c.iso3 === selectedIso3) || null : null),
    [countries, selectedIso3],
  )

  // ----- render --------------------------------------------------------
  return (
    <div className="cb-app">
      <style>{CSS}</style>

      <header className="cb-header">
        <h1>
          <span className="cb-eyebrow">Atlas</span>
          {visitedCount === 0
            ? 'Tap a country.'
            : visitedCount === 1
            ? 'First stamp.'
            : `${visitedCount} stamps on the map.`}
        </h1>
        <div className="cb-header-meta">
          <SyncPill online={online} hasRuntime={storage.hasRuntime()} />
          <div
            className={'cb-counter' + (offlineBoot ? ' cb-counter--faded' : '')}
            aria-label={
              totalCount > 0
                ? `${visitedCount} of ${totalCount} countries visited, ${Math.round(
                    (visitedCount / totalCount) * 100,
                  )} percent`
                : `${visitedCount} of ${totalCount} countries visited`
            }
          >
            <strong>{visitedCount}</strong>
            <span>/ {totalCount || '…'}</span>
            {totalCount > 0 ? (
              <span className="cb-counter-pct">
                {Math.round((visitedCount / totalCount) * 100)}%
              </span>
            ) : null}
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
            wishlist={wishlist}
            selectedIso3={selectedIso3}
            focusRequest={focusRequest}
            onTapCountry={selectCountry}
            onTapOcean={deselect}
          />
        )}
      </div>

      <BottomSheet
        countries={filteredCountries}
        visited={visited}
        wishlist={wishlist}
        selectedCountry={selectedCountry}
        query={query}
        onQueryChange={setQuery}
        onSelect={selectCountry}
        onToggleVisited={toggleVisited}
        onToggleWishlist={toggleWishlist}
        onDeselect={deselect}
      />
    </div>
  )
}
