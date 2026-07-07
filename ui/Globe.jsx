import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  INITIAL_ROTATION,
  INERTIA_FRICTION,
  INERTIA_MAX_SPEED,
  INERTIA_MIN_SPEED,
  MAX_ZOOM,
  MIN_ZOOM,
  RAD2DEG,
  VELOCITY_SAMPLES,
  ZOOM_EASE,
  ZOOM_SNAP_EPS,
  ZOOM_STEP,
  clamp,
  easePointerToDisc,
  nextDragRotation,
  pinchSpread,
  reverseWinding,
  shortestLngDelta,
  solveVersorDrag,
  versorCartesian,
  versorFromAngles,
} from '../domain.js'

// --------------------------------------------------------------------------
// Globe — orthographic d3-geo projection on an SVG canvas.
//
// The globe only moves when the user moves it (drag to rotate, pinch /
// wheel / keys to zoom). An autonomous idle spin and a pan-to-country
// animation both used to live here; the spin was removed on owner feedback
// (a globe that drifts on its own fights the user's framing) and the pan
// was reverted earlier for hijacking tap-to-select.
// --------------------------------------------------------------------------
export function Globe({
  countries,
  visited,
  wishlist,
  selectedIso3,
  statusFilter,
  onTapCountry,
  onTapOcean,
  onGeometryRepaired,
}) {
  const containerRef = useRef(null)
  const d3Ref = useRef(null)
  const dragRef = useRef({
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    startRotate: INITIAL_ROTATION.slice(),
  })
  const rotationRef = useRef(INITIAL_ROTATION.slice())
  // pinchRef holds the in-flight two-finger gesture. While active it owns
  // the globe: drag-rotate stands down (it checks pinchRef.current.active)
  // so the two gestures never fight over rotation.
  const pinchRef = useRef({ active: false, startDist: 0, startZoom: 1 })
  // Live pointer positions keyed by pointerId. A single entry = drag; a
  // second entry promotes the gesture to a pinch. This is the one place
  // that knows "how many fingers are down".
  const pointersRef = useRef(new Map())
  const zoomRef = useRef(1)
  // Zoom glide — wheel/keys set zoomTargetRef (the zoom the user asked for);
  // an rAF follower eases zoomRef → zoomTargetRef and mirrors it to state each
  // frame. zoomGlideRafRef holds that loop's id so a new gesture / unmount can
  // cancel it. Pinch writes zoomRef directly and parks the target alongside it,
  // so a finger-locked pinch never fights a leftover glide.
  const zoomTargetRef = useRef(1)
  const zoomGlideRafRef = useRef(0)
  // rAF coalescing — a fast drag fires pointermove at 60–120Hz, but each
  // setRotation rebuilds the d3 projection + geoPath and repaints all ~195
  // country paths. Coalesce: gesture handlers stash the latest solved rotation
  // in pendingRotationRef and ask for ONE frame (rafRef guards re-scheduling);
  // the frame flushes ref → state, so we re-render at most once per display
  // refresh no matter how many moves arrived between frames.
  const rafRef = useRef(0)
  const pendingRotationRef = useRef(null)
  // Release inertia — the last few move deltas give an angular velocity
  // [dLng, dLat] per frame; on release a decay loop (vel *= FRICTION) keeps
  // feeding rotation so the globe glides to rest instead of stopping dead.
  // inertiaRef holds that loop's frame id so pointerdown / unmount can cancel it.
  const velocityRef = useRef({ vLng: 0, vLat: 0, samples: [] })
  const inertiaRef = useRef(0)
  // Two independent motion sources can keep the globe "in motion": the
  // release-inertia spin and the zoom glide. spinning (coarse tessellation)
  // must stay true while EITHER runs, so each owns a boolean and the derived
  // flag is their OR — without this, the first loop to settle would prematurely
  // snap the projection crisp while the other is still animating.
  const inertiaActiveRef = useRef(false)
  const zoomGlideActiveRef = useRef(false)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [rotation, setRotation] = useState(INITIAL_ROTATION.slice())
  // zoom is a multiplier on the base radius; see MIN_ZOOM/MAX_ZOOM. Held in
  // both a ref (read synchronously by gesture handlers) and state (drives
  // the re-render) the same way rotation is — setZoomBoth keeps them in sync.
  const [zoom, setZoom] = useState(1)
  const [ready, setReady] = useState(false)
  // True while a drag or release-glide is in flight. Flips at most twice per
  // gesture (grab → true, rest → false) — NOT per frame — so it costs no extra
  // renders, and lets the projection drop precision while the globe moves: a
  // coarser geoPath tessellation is cheaper to build + paint on every frame,
  // and the detail it skips is invisible on a spinning sphere. The crisp path
  // snaps back the instant motion settles.
  const [spinning, setSpinning] = useState(false)
  const spinningRef = useRef(false)
  // Recompute the public spinning flag from its two sources (drag/inertia and
  // zoom glide) and push it to state only when it actually flips — so neither
  // motion loop costs a render per frame, and whichever settles last is the one
  // that finally repaints the globe crisp.
  const syncSpinning = useCallback(() => {
    const on = inertiaActiveRef.current || zoomGlideActiveRef.current
    if (spinningRef.current === on) return
    spinningRef.current = on
    setSpinning(on)
  }, [])
  // Drag + release-inertia source toggle (kept named setSpinningBoth so its
  // existing call sites read unchanged); the zoom glide owns the other source.
  const setSpinningBoth = useCallback((on) => {
    inertiaActiveRef.current = on
    syncSpinning()
  }, [syncSpinning])
  // depFailed used to be sticky for the rest of the session — a single
  // hiccupping import (e.g. SW updating mid-flight) blanked the globe
  // until full reload. Now it's paired with a counter that retries on
  // every reconnect (see the useEffect listening for window 'online').
  const [depAttempt, setDepAttempt] = useState(0)
  const [depFailed, setDepFailed] = useState(false)

  // d3-geo lives at runtime — resolved by the app frame's import map to the
  // self-hosted /vendor/d3-geo@3 bundle (no longer esm.sh), so the globe works
  // offline-deterministically with no third-party CDN hop. A 5s timeout flips
  // the screen to the "still loading / retry" state so a cold-start can't sit on
  // a blank globe indefinitely (the same-origin /vendor module is normally
  // instant, but the SW may be priming). depAttempt is in the dep array so the
  // reconnect retry below can force another attempt.
  //
  // The import and the timeout are tracked SEPARATELY, not via Promise.race:
  // race resolves to whichever settles first and DISCARDS the loser, so a real
  // import that resolved at 5.1s (just after the timeout) was thrown away and
  // the globe stayed broken for the whole session. Here the import's success
  // handler ALWAYS wins when it eventually arrives — even past the timeout — so
  // a slow-but-successful load still renders. The timeout only surfaces the
  // retry affordance; it is not a failure, and it never cancels the import.
  useEffect(() => {
    let active = true
    const timeoutMs = 5000
    let timeoutId = 0
    setDepFailed(false)
    timeoutId = setTimeout(() => {
      // A timeout is NOT a load failure — if the import is still in flight it
      // may yet succeed (and the .then below will pick it up). We only show the
      // retry state when the module hasn't landed yet.
      if (active && !d3Ref.current) setDepFailed(true)
    }, timeoutMs)
    import('d3-geo')
      .then((mod) => {
        clearTimeout(timeoutId)
        if (!active) return
        // Late success after a timeout: adopt the module and clear the retry
        // state. This is the fix for the dropped-late-winner bug.
        d3Ref.current = mod
        setReady(true)
        setDepFailed(false)
      })
      .catch((err) => {
        clearTimeout(timeoutId)
        // eslint-disable-next-line no-console
        console.error('d3-geo failed to load', err)
        if (active) setDepFailed(true)
        // error (Reflection) — a real d3-geo import rejection (not the timeout,
        // which may still resolve) means the globe can't render. Flat, no PII.
        if (typeof window !== 'undefined') {
          window.mobius?.signal?.('error', {
            message: String(err?.message || err),
            source: 'd3-geo',
          })
        }
      })
    return () => {
      active = false
      clearTimeout(timeoutId)
    }
  }, [depAttempt])

  // When the browser reconnects, retry the d3-geo import if it failed. The
  // /vendor copy is precached by the SW, so this is just belt-and-braces for a
  // cold start that timed out before the precache settled; it kicks the effect
  // to try again.
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
    if (!containerRef.current) return undefined
    const measure = () => {
      if (!containerRef.current) return
      setSize({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      })
    }
    measure()
    // ResizeObserver is near-universal but absent in some embedded webviews and
    // SSR — guard it so its absence degrades to a one-time measure() (the
    // projection still renders at the initial size) instead of throwing on
    // `new ResizeObserver` and blanking the whole globe.
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(measure)
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  // Native touch guard — the reason a real device wouldn't spin/zoom.
  // `touch-action: none` is set on the SVG (and its container), but WebKit/iOS
  // does NOT reliably honor touch-action on an <svg> element (long-standing
  // engine gap): the browser claims a one-finger drag as a page-pan and a two-
  // finger gesture as a page-zoom BEFORE the pointer stream reaches the drag/
  // pinch handlers — so on device the globe reads as dead (drag) or half-alive
  // (pinch fighting the browser zoom), even though the pointer logic itself is
  // correct. React's onTouch* handlers are registered passive and cannot
  // preventDefault, so the declarative touch-action guard is all we'd otherwise
  // have. Attach a NON-PASSIVE touchmove listener and cancel the browser's
  // default gesture directly. Pointer events are unaffected by this (they are
  // not the prevented "compatibility" events), so drag/pinch keep receiving a
  // clean stream. touchstart is deliberately left alone: a stationary tap must
  // still fire the country/ocean onClick — only a MOVE (drag or pinch) is
  // cancelled. Bound to the always-present container div so it survives the
  // loading/error inner-content swaps.
  useEffect(() => {
    const node = containerRef.current
    if (!node || typeof node.addEventListener !== 'function') return undefined
    const onTouchMove = (event) => {
      // Only cancel multi-touch or an actual drag; a single motionless touch
      // never reaches here (touchmove only fires once the finger moves), so
      // this preventDefault targets exactly the gestures the browser would
      // otherwise steal.
      if (event.cancelable) event.preventDefault()
    }
    node.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => node.removeEventListener('touchmove', onTouchMove)
  }, [])

  // Cancel a pending coalesced frame — called on pointerdown (so a fresh grab
  // doesn't flush a stale frame) and on unmount.
  const cancelRotationFrame = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
    pendingRotationRef.current = null
  }, [])

  // Cancel the release-inertia decay loop — called on the next pointerdown so a
  // new grab takes over cleanly, and on unmount.
  const cancelInertia = useCallback(() => {
    if (inertiaRef.current) {
      cancelAnimationFrame(inertiaRef.current)
      inertiaRef.current = 0
    }
  }, [])

  // Coalesced rotation setter — gesture handlers call this on EVERY pointer
  // move; it only schedules one rAF per frame. rotationRef stays live (so the
  // versor solver always reads the freshest baseline), but setRotation — the
  // expensive re-render — fires once per frame from the flush below.
  const scheduleRotation = useCallback((next) => {
    rotationRef.current = next // keep the gesture baseline exact between frames
    pendingRotationRef.current = next
    if (rafRef.current) return // a frame is already queued; it'll pick up the latest
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      const pending = pendingRotationRef.current
      pendingRotationRef.current = null
      if (pending) setRotation(pending)
    })
  }, [])

  // Record one move's angular delta so finishDrag can read the release velocity.
  // We keep the last VELOCITY_SAMPLES so a jittery final frame doesn't define
  // the whole glide; the average is the flick the user actually made.
  const recordVelocity = useCallback((prev, next) => {
    const dLng = shortestLngDelta(prev[0] ?? 0, next[0] ?? 0)
    const dLat = (next[1] ?? 0) - (prev[1] ?? 0)
    const v = velocityRef.current
    v.samples.push([dLng, dLat])
    if (v.samples.length > VELOCITY_SAMPLES) v.samples.shift()
  }, [])

  // Run the release glide. Reads the averaged sample velocity, clamps it, then
  // feeds rotation each frame with vel *= friction until it drops below the
  // perceptible-motion threshold. Cancelled by the next pointerdown / unmount.
  // Owns the "spinning" flag for the glide's lifetime: any exit without a live
  // loop clears it so the projection snaps back to crisp the moment it rests.
  const startInertia = useCallback(() => {
    cancelInertia()
    const samples = velocityRef.current.samples
    let vLng = samples.length ? samples.reduce((s, d) => s + d[0], 0) / samples.length : 0
    let vLat = samples.length ? samples.reduce((s, d) => s + d[1], 0) / samples.length : 0
    // Clamp the flick magnitude so a fast swipe glides briskly but stays read-
    // able rather than blurring; tiny drifts below the floor never start a loop.
    const speed = Math.hypot(vLng, vLat)
    if (speed < INERTIA_MIN_SPEED) {
      setSpinningBoth(false) // released without a flick — rest now, paint crisp
      return
    }
    if (speed > INERTIA_MAX_SPEED) {
      const k = INERTIA_MAX_SPEED / speed
      vLng *= k
      vLat *= k
    }
    const step = () => {
      vLng *= INERTIA_FRICTION
      vLat *= INERTIA_FRICTION
      if (Math.hypot(vLng, vLat) < INERTIA_MIN_SPEED) {
        inertiaRef.current = 0
        setSpinningBoth(false) // glide settled — repaint crisp
        return
      }
      const cur = rotationRef.current
      const next = nextDragRotation(cur, (cur[0] ?? 0) + vLng, (cur[1] ?? 0) + vLat)
      if (next) {
        rotationRef.current = next
        setRotation(next) // already one update per frame — no extra coalescing needed
      }
      inertiaRef.current = requestAnimationFrame(step)
    }
    inertiaRef.current = requestAnimationFrame(step)
  }, [cancelInertia, setSpinningBoth])

  // Stop the zoom-glide follower wherever it is and re-park the target at the
  // frozen zoom. Called on pointerdown (a fresh grab/pinch interrupts the glide)
  // and unmount. Re-parking matters: a glide interrupted mid-flight leaves the
  // rendered zoom short of its old target — without resetting zoomTargetRef, the
  // next wheel notch (zoomBy reads the target) would compound from the stale far
  // target and jump. A subsequent pinch overwrites both anyway; this keeps the
  // wheel/keys path honest.
  const cancelZoomGlide = useCallback(() => {
    if (zoomGlideRafRef.current) {
      cancelAnimationFrame(zoomGlideRafRef.current)
      zoomGlideRafRef.current = 0
    }
    zoomTargetRef.current = zoomRef.current
    if (zoomGlideActiveRef.current) {
      zoomGlideActiveRef.current = false
      syncSpinning()
    }
  }, [syncSpinning])

  // The zoom-glide follower. Each frame eases the rendered zoom toward the live
  // target (zoomTargetRef, which wheel/keys keep updating) and mirrors it to
  // state. The loop reads zoomRef — never the stale state captured in this
  // closure — as the imperative source of truth, so successive notches just move
  // the target and the in-flight loop picks it up. Within ZOOM_SNAP_EPS it lands
  // exact and stops; the spinning flag drops with it so the globe repaints crisp.
  const startZoomGlide = useCallback(() => {
    if (zoomGlideRafRef.current) return // a frame is already queued; it reads the latest target
    if (!zoomGlideActiveRef.current) {
      zoomGlideActiveRef.current = true
      syncSpinning() // coarse tessellation for the duration of the glide
    }
    const step = () => {
      const target = zoomTargetRef.current
      const cur = zoomRef.current
      const next = cur + (target - cur) * ZOOM_EASE
      if (Math.abs(target - next) < ZOOM_SNAP_EPS) {
        zoomRef.current = target
        setZoom(target)
        zoomGlideRafRef.current = 0
        zoomGlideActiveRef.current = false
        syncSpinning() // glide settled — repaint crisp
        return
      }
      zoomRef.current = next
      setZoom(next)
      zoomGlideRafRef.current = requestAnimationFrame(step)
    }
    zoomGlideRafRef.current = requestAnimationFrame(step)
  }, [syncSpinning])

  // The single owner of "current zoom". Clamps to [MIN_ZOOM, MAX_ZOOM] so no
  // caller has to remember the bounds. Two modes:
  //   ease=false (pinch): direct manipulation — write the ref + state NOW so the
  //     globe scales finger-locked, and park the glide target alongside so a
  //     leftover follower can't drag the zoom back.
  //   ease=true (wheel/keys): set the target and let startZoomGlide ease the
  //     rendered zoom toward it, turning a discrete notch into a smooth glide.
  const setZoomBoth = useCallback(
    (next, { ease = false } = {}) => {
      const safe = Number.isFinite(next) && next > 0 ? next : zoomRef.current
      const clamped = clamp(safe, MIN_ZOOM, MAX_ZOOM)
      zoomTargetRef.current = clamped
      if (ease) {
        startZoomGlide()
        return
      }
      cancelZoomGlide()
      zoomRef.current = clamped
      setZoom(clamped)
    },
    [startZoomGlide, cancelZoomGlide],
  )

  // Multiply the current TARGET zoom by a factor and glide there — the shape the
  // discrete inputs speak (wheel notch, +/- step). Reads the target, not the
  // live (mid-glide) zoom, so rapid notches compound smoothly instead of each
  // one re-aiming from a half-finished position. Multiplicative so a step feels
  // the same whether you're zoomed in or out, and symmetric: f then 1/f returns
  // you exactly where you started. (Pinch does NOT go through here — it calls
  // setZoomBoth directly with ease:false for finger-locked scaling.)
  const zoomBy = useCallback(
    (factor) => {
      if (!Number.isFinite(factor) || factor <= 0) return
      setZoomBoth(zoomTargetRef.current * factor, { ease: true })
    },
    [setZoomBoth],
  )

  // Cancel any in-flight frame / inertia / zoom-glide loop when the globe
  // unmounts so a late rAF can't call setState on a torn-down component.
  useEffect(() => () => {
    cancelRotationFrame()
    cancelInertia()
    cancelZoomGlide()
  }, [cancelRotationFrame, cancelInertia, cancelZoomGlide])


  // Repair inverted-winding features once d3-geo is loaded. Some source
  // features (here: Bermuda) ship an outer ring wound the wrong way; d3-geo
  // then fills the whole hemisphere for that feature, which both paints a
  // giant disc AND — because each country path is the tap target — swallows
  // every globe tap (the "tapping the globe selects Bermuda" bug). geoArea
  // > 2π is the signature of an inverted feature; rewind it. Memoized so the
  // ~180 area checks run once per data/d3-ready change, not per render.
  const normalized = useMemo(() => {
    const d3 = d3Ref.current
    if (!d3) return { list: countries, rewoundCount: 0, droppedPolygonCount: 0 }
    const FULL_SPHERE = 2 * Math.PI
    const areaOf = (geometry) =>
      d3.geoArea({ type: 'Feature', properties: {}, geometry })
    let rewoundCount = 0
    let droppedPolygonCount = 0
    const list = countries.map((c) => {
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
          droppedPolygonCount += geometry.coordinates.length - kept.length
          geometry = { ...geometry, coordinates: kept }
        }
      }
      // Genuine inverted winding (e.g. Bermuda) still fills the hemisphere after
      // the drop above; rewind the whole feature so d3 fills its interior.
      if (areaOf(geometry) > FULL_SPHERE) {
        rewoundCount += 1
        return { ...c, geometry: reverseWinding(geometry) }
      }
      return { ...c, geometry }
    })
    return { list, rewoundCount, droppedPolygonCount }
  }, [countries, ready])
  const normalizedCountries = normalized.list

  // Report the seed geometry repair counts up to the app (which emits the
  // geometry_repaired Reflection signal). The parent dedups to one emit and only
  // fires when a repair actually happened, so a clean seed reports nothing.
  useEffect(() => {
    if (!ready || !d3Ref.current) return
    onGeometryRepaired?.({
      rewoundCount: normalized.rewoundCount,
      droppedPolygonCount: normalized.droppedPolygonCount,
      countryCount: normalized.list.length,
    })
  }, [ready, normalized, onGeometryRepaired])

  // Paint the selected country last. SVG stacks in document order, so a
  // selected feature drawn early gets its boundary overpainted along every
  // border it shares with a later-drawn neighbor. Reordering only the
  // render keeps the list/tab order story simple (React moves the keyed <g>,
  // hit-testing is unaffected — fills tile, so nothing new occludes a tap).
  const renderCountries = useMemo(() => {
    if (!selectedIso3) return normalizedCountries
    const selected = normalizedCountries.find((c) => c.iso3 === selectedIso3)
    if (!selected) return normalizedCountries
    return [...normalizedCountries.filter((c) => c.iso3 !== selectedIso3), selected]
  }, [normalizedCountries, selectedIso3])

  // Re-compute projection on every rotation/zoom/size change.
  const projectionData = useMemo(() => {
    if (!ready || !d3Ref.current || !size.width || !size.height) return null
    const d3 = d3Ref.current
    // Base radius — 52% of the smaller dim makes the default globe read as the
    // hero of the screen (it was 46%, sized for the old half-height list; with
    // the list now collapsed by default the globe has the room to be bigger).
    // zoom (a multiplier) scales it; the radius below is the *visible* radius,
    // so the halo/sphere geometry tracks the zoom too.
    const radius = Math.min(size.width, size.height) * 0.52 * zoom
    const projection = d3
      .geoOrthographic()
      .translate([size.width / 2, size.height / 2])
      .scale(radius)
      .clipAngle(90)
      .rotate(rotation)
      // Coarser tessellation while the globe is in motion (drag / glide) — the
      // adaptive-resampling threshold a path subdivides to. The extra vertices
      // a crisp 0.4 buys are imperceptible on a moving sphere but cost real time
      // every frame; 1.6 paints ~the same silhouette far cheaper, then we snap
      // back to crisp the instant it rests.
      .precision(spinning ? 1.6 : 0.4)
    const path = d3.geoPath(projection)
    const graticule = d3.geoGraticule10()
    return { projection, path, graticule, radius }
  }, [ready, rotation, zoom, size.height, size.width, spinning])

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
    }
  }

  const onPointerDown = (event) => {
    event.currentTarget.blur?.()
    // A fresh grab takes over: stop any glide already in flight (rotation OR
    // zoom) and drop a queued coalesced frame so the new gesture starts from the
    // live rotation/zoom.
    cancelInertia()
    cancelZoomGlide()
    cancelRotationFrame()
    velocityRef.current.samples = []
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    event.currentTarget.setPointerCapture?.(event.pointerId)
    if (pointersRef.current.size >= 2) {
      // Second finger down — enter pinch. Drag stands down (and is flagged
      // moved so the gesture can't end in a tap).
      dragRef.current.active = false
      dragRef.current.moved = true
      pinchRef.current = {
        active: true,
        startDist: pinchSpread(pointersRef.current) || 1,
        startZoom: zoomRef.current,
      }
    } else {
      // Drag-rotate begins — mark the globe in-motion so the projection drops
      // to the cheaper tessellation for the duration of the gesture + glide.
      setSpinningBoth(true)
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
    // earth's surface.) The pointer is clamped just inside the silhouette before
    // every invert (easePointerToDisc), so a drag that reaches the edge stays
    // smooth and stable instead of snapping — see solveVersorDrag. Falls back to a
    // radius-scaled deg/px only when d3 isn't ready yet.
    const d3 = d3Ref.current
    const drag = dragRef.current
    if (d3 && projectionData) {
      const rect = event.currentTarget.getBoundingClientRect()
      const px = event.clientX - rect.left
      const py = event.clientY - rect.top
      const cx = size.width / 2
      const cy = size.height / 2
      const radius = projectionData.radius
      const makeProjection = (rot) =>
        d3
          .geoOrthographic()
          .translate([cx, cy])
          .scale(radius)
          .clipAngle(90)
          .rotate(rot)
      // Capture the grab baseline on the first move of the gesture (and after a
      // pinch hands control back). Soft-ease the grab pixel into the disc too, so
      // a gesture that STARTS near the edge still anchors to a real surface point
      // instead of falling back to the linear path.
      if (!drag.v0) {
        const [gx, gy] = easePointerToDisc(px, py, cx, cy, radius)
        const grab = makeProjection(rotationRef.current).invert([gx, gy])
        if (grab && Number.isFinite(grab[0]) && Number.isFinite(grab[1])) {
          drag.startRotate = rotationRef.current.slice()
          drag.v0 = versorCartesian(grab)
          drag.q0 = versorFromAngles(drag.startRotate)
        }
      }
      if (drag.v0) {
        const next = solveVersorDrag({
          makeProjection,
          startRotate: drag.startRotate,
          v0: drag.v0,
          q0: drag.q0,
          current: rotationRef.current,
          px,
          py,
          cx,
          cy,
          radius,
        })
        // null → this frame would cross a pole or inverted off-sphere; hold the
        // last good rotation (the gesture stays alive for the next move).
        if (next) {
          recordVelocity(rotationRef.current, next)
          scheduleRotation(next)
        }
        return
      }
    }

    // Fallback: radius-scaled deg/px — exact at the globe centre for any zoom
    // and viewport. Used only while d3 loads (before the versor path can run).
    const degPerPx = projectionData ? RAD2DEG / projectionData.radius : 0.4 / zoomRef.current
    const [startLng, startLat] = drag.startRotate
    const next = nextDragRotation(rotationRef.current, startLng + dx * degPerPx, startLat - dy * degPerPx)
    if (next) {
      recordVelocity(rotationRef.current, next)
      scheduleRotation(next)
    }
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
    const wasDrag = dragRef.current.active && dragRef.current.moved
    dragRef.current.active = false

    // Release glide — only when the finger actually dragged (a tap selects and
    // must not spin). Drop any queued coalesced frame first so the inertia loop
    // owns rotation outright and starts from the live value, then decay to rest.
    // startInertia owns the spinning flag once a drag releases; a non-drag
    // (tap, or a gesture that opened with a finger but never moved) rests now.
    if (wasDrag) {
      cancelRotationFrame()
      startInertia()
    } else {
      setSpinningBoth(false)
    }
    velocityRef.current.samples = []

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
  // pointerleave must NOT end an in-progress drag. On iOS Safari, a
  // pointer-captured touch-drag STILL fires spurious pointerleave every frame
  // as the globe re-renders (the country paths under the finger rebuild their
  // `d` each frame and the hit-target churns), and routing every leave through
  // finishDrag aborted the drag ~7×/swipe — the on-device diagnostic showed 139
  // finishes vs 19 real gestures, so 494 pointermoves produced only 13 solved
  // rotations. That IS the "one finger does nothing" bug: the drag dies a few
  // pixels in, over and over. While the pointer is still down it lives in
  // pointersRef, so ignore leave for a tracked pointer; the real end still
  // arrives via pointerup / pointercancel (and lostpointercapture below). A
  // genuine leave-while-up (mouse exits the SVG with no button) is unaffected —
  // that pointer isn't in the map.
  const onPointerLeave = (event) => {
    if (pointersRef.current.has(event.pointerId)) return
    finishDrag(event)
  }
  // Some browsers fire lostpointercapture without a paired pointerup
  // (e.g. iOS Safari when a modal overlays mid-drag). Treat that as a
  // drag finish so we don't get stuck with dragRef.active=true — but, like
  // leave above, only when the pointer is no longer down. Losing capture while
  // the finger is still tracked would otherwise abort a live drag; if capture is
  // truly gone the subsequent pointerup still finalizes it.
  const onLostPointerCapture = (event) => {
    if (pointersRef.current.has(event.pointerId)) return
    finishDrag(event)
  }

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
            // Mirror the list's status filter on the globe: countries that
            // don't match fade back so the matching set reads at a glance.
            // The selected country never dims — selection outranks filters.
            const matchesFilter =
              !statusFilter ||
              statusFilter === 'all' ||
              (statusFilter === 'visited' ? isVisited : isWishlisted && !isVisited)
            const isDimmed = !matchesFilter && !isSelected
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
                    (isSelected ? ' cb-country--selected' : '') +
                    (isDimmed ? ' cb-country--dimmed' : '')
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
