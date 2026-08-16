import { COUNTRY_FACTS } from './constants.js'

// --------------------------------------------------------------------------
// Helpers.
// --------------------------------------------------------------------------
const soften = (value) => String(value || '').toLowerCase().trim()
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

// Pointer capture retargets pointer-up (and therefore click) to the element
// holding capture. The country list may capture empty-space drags when it is
// scrolled to the top, but it must leave native controls alone or a tap on a
// country/status button becomes a zero-distance sheet drag instead of a click.
export const SHEET_DRAG_INTERACTIVE_SELECTOR = [
  'button',
  'a[href]',
  'input',
  'textarea',
  'select',
  'summary',
  '[role="button"]',
  '[contenteditable="true"]',
].join(',')

export function shouldStartSheetBodyDrag(atTop, target) {
  if (!atTop) return false
  const interactive = target?.closest?.(SHEET_DRAG_INTERACTIVE_SELECTOR)
  return !interactive
}


// Pick the saying index at random WITHOUT repeating the one on screen.
// Returns -1 when the list is empty (the caller renders nothing) and stays put
// when the list has a single entry (no other choice). `random` is injected so
// the pick is unit-testable; it defaults to Math.random in the app. The app
// calls this ONCE on mount (no interval) so the line is fixed per app-open.
export function pickRotatingSaying(sayings, currentIndex, random = Math.random) {
  if (!Array.isArray(sayings) || sayings.length === 0) return -1
  if (sayings.length === 1) return 0
  let next = Math.floor(random() * sayings.length)
  if (next >= sayings.length) next = sayings.length - 1 // guard random()===1
  // Avoid a back-to-back repeat: step one forward and wrap.
  if (next === currentIndex) next = (next + 1) % sayings.length
  return next
}

// Versor (unit-quaternion) helpers for "grab the surface" dragging. A fixed
// deg/px drag can't track the surface: on an orthographic globe the same
// finger travel sweeps a different angle depending on zoom, viewport size,
// and where on the sphere you grabbed (the limb foreshortens). Versor maths
// solves the rotation that carries the point first grabbed to the point now
// under the pointer, so the surface stays glued to the finger everywhere.
// Ported from Mike Bostock's `versor` (ISC) — kept inline so the app needs no
// extra runtime dep beyond d3-geo (which is already gated for offline).
const DEG2RAD = Math.PI / 180
export const RAD2DEG = 180 / Math.PI
// [lng, lat]° → unit vector on the sphere.
export const versorCartesian = (e) => {
  const l = e[0] * DEG2RAD
  const p = e[1] * DEG2RAD
  const cp = Math.cos(p)
  return [cp * Math.cos(l), cp * Math.sin(l), Math.sin(p)]
}
// Euler rotation [λ, φ, γ]° → quaternion.
export const versorFromAngles = (e) => {
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
export function pinchSpread(pointers) {
  const [a, b] = [...pointers.values()]
  return Math.hypot(a.x - b.x, a.y - b.y)
}

// Initial rotation — Western Europe slightly above the equator. Easier to
// recognize than 0,0 (which puts the user in the Atlantic).
export const INITIAL_ROTATION = [12, -22, 0]
// Closest the view-centre is allowed to approach a pole. The globe stays
// north-up (roll = 0), so this is a real ceiling — but it's reached via a
// smooth ease (see softClampLat), not a hard wall.
export const ROTATION_SINGULARITY_LAT = 88
// Below this latitude, dragging is exact 1:1 versor manipulation. Past it we
// ease latitude toward the ceiling and damp longitude (see nextDragRotation).
const POLE_EASE_START = 72

// Zoom — a multiplier on the size-derived base radius (1 = the default
// "fits the canvas" globe). Kept as a multiplier, not an absolute pixel
// scale, so it survives a resize: the bottom sheet dragging up shrinks the
// base radius but the user's chosen zoom level rides along unchanged.
// MIN < 1 lets the user pull back for a fuller sphere; MAX caps the zoom-in
// before country borders turn to mush. To change the zoom range, edit these
// two — every gesture (pinch, wheel, +/- buttons, keyboard) clamps to them.
export const MIN_ZOOM = 0.75
export const MAX_ZOOM = 6
// Each +/- button press (and keyboard +/-) steps the zoom by this factor.
// 1.28× per step keeps keyboard zoom calmer than the old 1.4× jump while
// still crossing the range in a handful of presses.
export const ZOOM_STEP = 1.28

// Zoom glide — wheel notches and +/- keys are DISCRETE: each one would jump
// the radius in a single step (a visible staircase). Instead they set a zoom
// TARGET and a per-frame follower eases the rendered zoom toward it
//   zoom += (target - zoom) * ZOOM_EASE
// the same critically-damped lerp the ISS-tracker globe uses for its camera.
// 0.2/frame ≈ a ~0.2s glide — smooth but still snappy. A pinch is DIRECT
// manipulation (finger-locked), so it bypasses the ease and sets zoom now;
// only the discrete inputs glide. Below ZOOM_SNAP_EPS the follower is within
// a pixel of the target, so it snaps exact and stops (no infinite asymptote).
export const ZOOM_EASE = 0.18
export const ZOOM_SNAP_EPS = 0.0005

// Release inertia — when the finger lifts, the globe keeps spinning with the
// velocity it had and decays by INERTIA_FRICTION each frame (≈0.9 → loses
// ~10%/frame, a short controlled glide at 60fps). Below INERTIA_MIN_SPEED°/frame
// the motion is imperceptible, so the loop stops. INERTIA_MAX_SPEED caps a
// flick so a fast swipe can't launch the globe into a blur.
export const INERTIA_FRICTION = 0.9
export const INERTIA_MIN_SPEED = 0.02 // °/frame — below this the glide has visually stopped
export const INERTIA_MAX_SPEED = 5.5 // °/frame — clamp a hard flick to a readable spin
// How many recent move deltas average into the release velocity. Averaging the
// last few (not just the final delta) smooths out a jittery last sample so the
// glide direction matches the swipe the user actually made.
export const VELOCITY_SAMPLES = 4

// Total angular distance between two [lng, lat]° points on the sphere, in
// degrees (the great-circle angle). Used by tests to assert a near-edge drag
// produces a bounded rotation (no runaway limb snap).
export const angularStepDeg = (a, b) => {
  const va = versorCartesian(a)
  const vb = versorCartesian(b)
  const dot = Math.max(-1, Math.min(1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]))
  return Math.acos(dot) * RAD2DEG
}

// Soft-ease the pointer's distance-from-centre toward (but never past) the
// sphere's silhouette before inverting it. THIS is the fix for the owner's
// "I drag the globe but at the left/right boundaries it moves nonlinearly —
// a bit too abrupt." On an orthographic globe the inverse projection maps the
// normalized disc radius ρ∈[0,1] to colatitude asin(ρ); its angular gain
// d(asin ρ)/dρ = 1/√(1−ρ²) DIVERGES at the limb (ρ→1). So the last few percent
// of the disc already sweep a steeply-accelerating angle (gain ≈ 7× at ρ=0.95,
// ≈ 22× at ρ=0.999) — that ramp IS the abruptness. The previous fix HARD-clamped
// ρ to a fixed 0.999 circle: it removed the runaway but introduced two
// discontinuities of its own — the gain still spiked up to the wall, then every
// pointer past it collapsed onto one frozen circle (slope 0 → a dead-zone). A
// hard clamp can't feel smooth because its derivative is discontinuous.
//
// The smooth solution (the feel of travel apps like "Been"): keep the inner
// disc EXACTLY 1:1 versor tracking, then ease ρ with a tanh falloff that
// asymptotes to a sub-limb ceiling. The response stays naturally nonlinear (the
// owner wants nonlinear) but its DERIVATIVE is continuous everywhere — no spike,
// no wall, no freeze — and the inverse gain is bounded (≈ 5.8× max instead of
// 22×+). A pointer dragged far off-disc keeps moving the globe a little further,
// monotonically, instead of jumping or sticking. This mirrors the production
// d3 globe-drag handlers (Fil's d3-inertia and vasturiano's d3-geo-zoom), which
// invert the RAW pointer and simply skip the frame when invert returns NaN
// off-disc — solveVersorDrag keeps that null-and-hold guard as a backstop; the
// ease here is what makes the approach-to-the-edge itself smooth.
// Sources: github.com/d3/versor, observablehq.com/@d3/versor-dragging (Bostock),
// github.com/Fil/d3-inertia (`if (isNaN(inv[0])) return`), d3-geo-zoom.

// Below this fraction of the radius the pointer is inverted unchanged — exact
// 1:1 grab-and-drag tracking through the whole centre of the globe.
const LIMB_EASE_START = 0.88
// The eased radius asymptotes to this fraction of the radius and never reaches
// the singular limb (ρ=1), which keeps the inverse gain bounded and finite.
const LIMB_EASE_CEIL = 0.985
export function easePointerToDisc(px, py, cx, cy, radius) {
  const dx = px - cx
  const dy = py - cy
  const dist = Math.hypot(dx, dy)
  if (!(radius > 0)) return [px, py]
  const rho = dist / radius
  if (!(rho > LIMB_EASE_START)) return [px, py] // inner disc: untouched, 1:1
  // tanh eases the excess radius so the result rises from LIMB_EASE_START toward
  // LIMB_EASE_CEIL, approaching but never crossing it — a continuous,
  // monotone, bounded mapping (no clamp wall, no dead-zone).
  const range = LIMB_EASE_CEIL - LIMB_EASE_START
  const eased = LIMB_EASE_START + range * Math.tanh((rho - LIMB_EASE_START) / range)
  const k = (eased * radius) / dist // dist > 0 here since rho > START ≥ 0
  return [cx + dx * k, cy + dy * k]
}

// Capture the surface point under a pointer at the moment a drag begins.
// Keeping this separate from solveVersorDrag preserves the important ordering:
// the anchor belongs to pointer-down, while the first displaced pointer-move
// must already produce a rotation. Capturing on that first move instead would
// consume it as setup and make every newly settled globe feel briefly stuck.
export function createVersorDragAnchor({ projection, rotation, px, py, cx, cy, radius }) {
  if (!projection?.invert || !Array.isArray(rotation)) return null
  const [gx, gy] = easePointerToDisc(px, py, cx, cy, radius)
  const grab = projection.invert([gx, gy])
  if (!grab || !Number.isFinite(grab[0]) || !Number.isFinite(grab[1])) return null
  const startRotate = rotation.slice()
  return {
    startRotate,
    v0: versorCartesian(grab),
    q0: versorFromAngles(startRotate),
  }
}

const isRotationSingular = (rotation) => Math.abs(rotation?.[1] || 0) >= ROTATION_SINGULARITY_LAT
// Smoothly compress latitude near the poles instead of slamming a hard clamp.
// tanh asymptotes toward the ceiling, so the drag *eases* into the pole — no
// wall to fight, no abrupt stop.
const softClampLat = (lat) => {
  const a = Math.abs(lat)
  if (a <= POLE_EASE_START) return lat
  const range = 90 - POLE_EASE_START // headroom above the ease point
  const cap = ROTATION_SINGULARITY_LAT - POLE_EASE_START // how far past it we allow
  const t = (a - POLE_EASE_START) / range // 0 at the ease point, grows past 1
  return Math.sign(lat) * (POLE_EASE_START + cap * Math.tanh(t))
}
// Shortest signed angular delta a→b in degrees, wrapped to (-180, 180].
export const shortestLngDelta = (a, b) => ((b - a + 540) % 360) - 180
export const nextDragRotation = (current, lng, lat) => {
  const nextLat = softClampLat(lat)
  const a = Math.abs(nextLat)
  // Near a pole a tiny horizontal drag maps to a huge longitude swing — that's
  // what read as "singular/twitchy". Damp the longitude step (only inside the
  // polar cap, never to zero) so the spin stays calm while the rest of the
  // globe keeps exact grab-and-drag tracking.
  let factor = 1
  if (a > POLE_EASE_START) {
    const t = Math.min(1, (a - POLE_EASE_START) / (90 - POLE_EASE_START))
    factor = 1 - 0.85 * t // eases down to 0.15 at the pole, never fully locked
  }
  const prevLng = current?.[0] ?? 0
  const nextLng = prevLng + shortestLngDelta(prevLng, lng) * factor
  return [nextLng, nextLat, 0]
}

// Solve one frame of versor drag: the rotation that carries the point first
// grabbed (v0, captured at startRotate q0) to the point now under the pointer,
// so the surface stays glued to the finger (Bostock/Davies versor dragging).
// The pointer is first soft-eased inside the silhouette (easePointerToDisc) so
// a near/over-edge pointer can't hit the limb singularity AND the approach to
// the edge stays smooth — that ease is why dragging the boundary no longer
// feels abrupt (the owner's report) and never "goes crazy". `makeProjection`
// builds a d3 orthographic projection for a given rotation (injected so this is
// pure and unit-testable with a real d3-geo but no DOM). Returns the next
// [lng, lat, 0] rotation (north-up: roll is dropped and the pole is soft-
// clamped via nextDragRotation), or null when the gesture should hold the last
// good rotation (grab/here inverted off-sphere, or a pole-crossing roll flip).
export function solveVersorDrag({ makeProjection, startRotate, v0, q0, current, px, py, cx, cy, radius }) {
  if (!v0 || !q0) return null
  const [cpx, cpy] = easePointerToDisc(px, py, cx, cy, radius)
  const here = makeProjection(startRotate).invert([cpx, cpy])
  if (!here || !Number.isFinite(here[0]) || !Number.isFinite(here[1])) return null
  const q = versorMultiply(q0, versorDelta(v0, versorCartesian(here)))
  const [lng, lat, roll] = versorToAngles(q)
  // Past a pole the versor decode folds latitude back down (asin's [-90,90]
  // range) and roll flips toward ±180° — the globe then appears to reverse.
  // A large roll means the drag tried to cross the pole; hold the last good
  // rotation so the vertical drag stays bounded by the N/S poles (the upright
  // feel a country picker wants) instead of flipping past them.
  if (Math.abs(roll) > 90) return null
  // North-up: take the solved longitude/latitude, drop the roll, and soft-clamp
  // the latitude near the poles. Away from the poles this is exact 1:1 versor
  // tracking; the pixel clamp above already bounds the per-frame step (versor's
  // own delta is an acos angle, intrinsically ≤180°), so no separate angle cap
  // is needed — and removing that cap is what stops the freeze-then-jump.
  return nextDragRotation(current, lng, lat)
}

// --------------------------------------------------------------------------
// Country basic-info (Change 6).
// --------------------------------------------------------------------------
// Look up the bundled facts for a country and shape them for the info card.
// Returns null when we have no facts row (the card then shows only what the
// geometry seed already carries — region + flag). Pure and exported so the
// data join is unit-testable without rendering.
export function lookupCountryInfo(iso3, facts = COUNTRY_FACTS) {
  if (!iso3 || !facts || typeof facts !== 'object') return null
  const row = facts[iso3]
  if (!row || typeof row !== 'object') return null
  const languages = Array.isArray(row.lang) ? row.lang.filter(Boolean) : []
  return {
    capital: row.cap || '',
    population: typeof row.pop === 'number' ? row.pop : null,
    area: typeof row.area === 'number' ? row.area : null,
    languages,
  }
}

// Human-readable population — grouped thousands (1,393,409,038). Falls back to
// an em dash so a missing value reads as "unknown", not "zero".
export function formatPopulation(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return Math.round(value).toLocaleString('en-US')
}

// Human-readable surface area in km² with grouped thousands. Same em-dash
// fallback as population so a missing area never renders a bare "0 km²".
export function formatArea(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return `${Math.round(value).toLocaleString('en-US')} km²`
}

// Join the main languages into one readable string, capped so a multilingual
// country (e.g. Switzerland's four) doesn't overflow the card.
export function formatLanguages(languages, max = 3) {
  if (!Array.isArray(languages) || languages.length === 0) return '—'
  const shown = languages.slice(0, max)
  const extra = languages.length - shown.length
  return extra > 0 ? `${shown.join(', ')} +${extra}` : shown.join(', ')
}

// The status filter (all / visited / wishlist) is a DEVICE-LOCAL VIEW
// PREFERENCE, not user data — it never round-trips to the server and never
// needs to converge across devices, so it lives in localStorage, scoped by
// appId. This is the ONLY thing Atlas keeps in localStorage. The codes
// themselves (visited.json / wishlist.json) persist exclusively through
// useDocument (see Atlas below); there is no separate local mirror of the
// codes — the runtime's offline read-through cache is the single offline
// store, so there is no two-copy "distrust" cache to keep in sync.
export const PREF_KEY = (appId, name) => `atlas-app:${appId}:${name}`

export function prefRead(appId, name) {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(PREF_KEY(appId, name))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function prefWrite(appId, name, data) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(PREF_KEY(appId, name), JSON.stringify(data))
  } catch {
    // Quota or private-mode — silent; a view preference is a nice-to-have.
  }
}

// Three-way set merge for an array of ISO-3 codes under mode:'lww'. The
// invariant: an ADD is never lost (a code present in EITHER side stays),
// and a REMOVE this context made (in `base`, absent in `mine`) is honored
// unless `theirs` re-added it — i.e. converged value = theirs ∪ (mine−base)
// − (base−mine). Pure union (the default merge) can't express a removal,
// so an untoggle would silently revert; this is why Atlas passes its own
// merge. Same-code add-vs-remove across contexts resolves last-writer-wins,
// which is what 'lww' promises. dedupe preserves `mine`'s order for stable
// React keys; case/identity is the bare code.
export function mergeCodeSets(base, mine, theirs) {
  const baseSet = toIsoSet(base)
  const mineSet = toIsoSet(mine)
  const theirsArr = Array.isArray(theirs) ? theirs.filter(Boolean) : []
  // Codes this context deliberately removed: in base, gone from mine.
  const removedHere = new Set([...baseSet].filter((code) => !mineSet.has(code)))
  const out = []
  const seen = new Set()
  const push = (code) => {
    if (!code || seen.has(code) || removedHere.has(code)) return
    seen.add(code)
    out.push(code)
  }
  // `mine` first so its order wins; then any code the other side contributed.
  for (const code of mine || []) push(code)
  for (const code of theirsArr) push(code)
  return out
}

// Dedupe a country list by iso3, keeping the first occurrence. The bundled
// GeoJSON ships duplicate entries for CYP / GUF / SOM, which (a) inflate the
// total count, and (b) produce duplicate React keys. The dupes are a KNOWN,
// expected property of the seed — collapsing them is the whole point of this
// function, so it does NOT warn: the prior console.warn fired on EVERY boot
// (the seed always carries those three), which is console noise, not a signal.
export function dedupeCountries(list) {
  if (!Array.isArray(list)) return []
  const seen = new Set()
  const out = []
  for (const c of list) {
    const iso3 = c?.iso3
    if (!iso3) continue
    if (seen.has(iso3)) continue
    seen.add(iso3)
    out.push(c)
  }
  return out
}

export function toIsoSet(values) {
  if (values instanceof Set) return new Set([...values].filter(Boolean))
  if (Array.isArray(values)) return new Set(values.filter(Boolean))
  return new Set()
}

// List order is alphabetical and INDEPENDENT of visited/wishlist state.
// It used to rank marked countries first, which meant every tap re-sorted
// the list out from under the user's thumb — mark a country mid-scroll and
// the row teleported toward the top. Stable order keeps the row exactly
// where it was; the status filter (see filterCountriesByStatus) is how the
// user asks for "just my visited" instead.
export const CONTINENT_ORDER = ['Africa', 'Americas', 'Asia', 'Europe', 'Oceania']

export function orderCountriesForList(countries, query = '') {
  if (!Array.isArray(countries)) return []
  const text = soften(query)
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
      const an = String(a.displayName || a.name || a.iso3 || '')
      const bn = String(b.displayName || b.name || b.iso3 || '')
      const nameOrder = an.localeCompare(bn)
      if (nameOrder !== 0) return nameOrder
      return String(a.iso3 || '').localeCompare(String(b.iso3 || ''))
    })
}

// One stable row per continent, including continents with no current search or
// filter matches. `total` always describes the complete atlas while `visited`
// is derived from the persisted visited set, so the summary never changes its
// denominator when the list is narrowed.
export function continentVisitStats(countries, visitedValues = new Set()) {
  const visited = toIsoSet(visitedValues)
  const byName = new Map(CONTINENT_ORDER.map((name) => [name, { name, visited: 0, total: 0 }]))
  for (const country of Array.isArray(countries) ? countries : []) {
    if (!country || typeof country !== 'object') continue
    const name = country.region || 'Other'
    if (!byName.has(name)) byName.set(name, { name, visited: 0, total: 0 })
    const row = byName.get(name)
    row.total += 1
    if (visited.has(country.iso3)) row.visited += 1
  }
  return Array.from(byName.values()).filter((row) => row.total > 0)
}

// The three status filters the chips offer. 'all' is the resting state.
export const STATUS_FILTERS = ['all', 'visited', 'wishlist']

// Status filtering is separate from ordering so the list can be narrowed
// without ever being re-sorted. Visited wins over wishlist when malformed
// persisted data lists a country in both sets — the same exclusivity
// toggleCountryStatus maintains.
export function filterCountriesByStatus(countries, filter, visitedValues = new Set(), wishlistValues = new Set()) {
  if (!Array.isArray(countries)) return []
  if (filter === 'visited') {
    const visitedSet = toIsoSet(visitedValues)
    return countries.filter((country) => visitedSet.has(country?.iso3))
  }
  if (filter === 'wishlist') {
    const visitedSet = toIsoSet(visitedValues)
    const wishlistSet = toIsoSet(wishlistValues)
    return countries.filter(
      (country) => wishlistSet.has(country?.iso3) && !visitedSet.has(country?.iso3),
    )
  }
  return countries
}

// An empty continent selection means "all continents". Once one or more cards
// are active, the list is the union of those regions so the cards compose as a
// true multi-select filter rather than replacing one another.
export function filterCountriesByContinents(countries, selectedValues = new Set()) {
  if (!Array.isArray(countries)) return []
  const selected = new Set(
    Array.from(selectedValues || []).map((value) => String(value || '').trim()).filter(Boolean),
  )
  if (selected.size === 0) return countries
  return countries.filter((country) => selected.has(country?.region || 'Other'))
}

// Describe the Reflection signal a status toggle should emit, given the
// country's CURRENT (pre-tap) membership and the status the user tapped. Pure
// so the created / deleted / updated decision is unit-testable without a signal
// sink; the component performs the actual window.mobius.signal() call. Returns:
//   { event:'item_created', type }              — status added from absent
//   { event:'item_deleted', type }              — existing status toggled off
//   { event:'item_updated', type, from, to }    — moved between visited/wishlist
// or null for an unrecognized status (never happens for a real tap). `type` is
// a domain noun ('visited_country' / 'wishlist_country'); a cross-status move
// carries flat from/to strings. wasVisited/wasWishlist must be mutually
// exclusive (visited wins) — the same exclusivity the render sets enforce.
export function classifyStatusToggle(wasVisited, wasWishlist, status) {
  if (status === 'visited') {
    if (wasVisited) return { event: 'item_deleted', type: 'visited_country' }
    if (wasWishlist) return { event: 'item_updated', type: 'country', from: 'wishlist', to: 'visited' }
    return { event: 'item_created', type: 'visited_country' }
  }
  if (status === 'wishlist') {
    if (wasWishlist) return { event: 'item_deleted', type: 'wishlist_country' }
    if (wasVisited) return { event: 'item_updated', type: 'country', from: 'visited', to: 'wishlist' }
    return { event: 'item_created', type: 'wishlist_country' }
  }
  return null
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
export function reverseWinding(geometry) {
  const flip = (rings) => rings.map((ring) => ring.slice().reverse())
  if (geometry.type === 'Polygon') {
    return { ...geometry, coordinates: flip(geometry.coordinates) }
  }
  if (geometry.type === 'MultiPolygon') {
    return { ...geometry, coordinates: geometry.coordinates.map(flip) }
  }
  return geometry
}
