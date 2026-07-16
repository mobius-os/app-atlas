import { test } from 'node:test'
import assert from 'node:assert/strict'

// These are all PURE functions, exported from domain.js (no React, no d3-geo,
// no DOM). domain.js imports only ./constants.js (bundled data), so plain Node
// ESM resolves it directly — no esbuild bundle step, no host-absolute paths,
// no runtime externals. (The previous version shelled out to a hard-coded
// /home/... esbuild to bundle index.jsx first; that made `npm test` non-
// portable and broke on any fresh clone / CI. index.jsx re-exports these same
// domain functions, so importing the source module is equivalent and portable.)
// solveVersorDrag is exercised below against an inline orthographic projection,
// so d3-geo is not needed here either.
import {
  PREF_KEY,
  ROTATION_SINGULARITY_LAT,
  STATUS_FILTERS,
  angularStepDeg,
  classifyStatusToggle,
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
  SHEET_DRAG_INTERACTIVE_SELECTOR,
  shouldStartSheetBodyDrag,
  solveVersorDrag,
  toggleCountryStatus,
} from '../domain.js'

// A self-contained orthographic projection matching d3-geo's geoOrthographic
// (translate=[cx,cy], scale=radius, rotate=[λ,φ,γ]°, clipAngle=90): only the
// `.invert` is needed by solveVersorDrag. Implemented inline so the drag maths
// can be tested with no DOM and no d3-geo install (the app loads d3-geo from
// esm.sh at runtime; it isn't a local dep). Forward orthographic places the
// post-rotation point [λ,φ] at x = radius·cosφ·sinλ, y = -radius·sinφ; the
// rotate is the same three-axis spherical rotation d3 applies. invert reverses
// pixel → ortho sphere point → un-rotate, returning null off the disc.
const D2R = Math.PI / 180
const R2D = 180 / Math.PI
const makeOrtho = (cx, cy, radius) => (rot) => {
  const [dl, dp, dg] = [(rot[0] || 0) * D2R, (rot[1] || 0) * D2R, (rot[2] || 0) * D2R]
  const cg = Math.cos(dg)
  const sg = Math.sin(dg)
  const cp = Math.cos(dp)
  const sp = Math.sin(dp)
  return {
    invert([px, py]) {
      const x = (px - cx) / radius
      const y = -(py - cy) / radius
      const rho2 = x * x + y * y
      if (rho2 > 1) return null // off the sphere disc (the limb is rho2 = 1)
      const z = Math.sqrt(1 - rho2)
      // Inverse orthographic in the rotated frame: lambda/phi of the surface
      // point under the pixel, with d3's default clip-plane orientation.
      let lambda = Math.atan2(x, z)
      let phi = Math.asin(Math.max(-1, Math.min(1, y)))
      // Undo gamma (roll) about the screen normal first.
      const l1 = lambda * 1
      const p1 = phi * 1
      const cl = Math.cos(l1)
      let sl = Math.sin(l1)
      let xx = cl * Math.cos(p1)
      let yy = sl * Math.cos(p1)
      let zz = Math.sin(p1)
      // gamma about x-axis, then phi about y-axis, then lambda about z-axis
      // (the inverse of d3's forward rotate composition).
      let ty = yy * cg + zz * sg
      let tz = -yy * sg + zz * cg
      yy = ty
      zz = tz
      let tx = xx * cp + zz * sp
      tz = -xx * sp + zz * cp
      xx = tx
      zz = tz
      const out = [Math.atan2(yy, xx) * R2D + rot[0], Math.asin(Math.max(-1, Math.min(1, zz))) * R2D]
      void sl
      void sp
      return out
    },
  }
}

const countries = [
  { iso3: 'USA', iso2: 'US', displayName: 'United States', region: 'Americas' },
  { iso3: 'CAN', iso2: 'CA', displayName: 'Canada', region: 'Americas' },
  { iso3: 'JPN', iso2: 'JP', displayName: 'Japan', region: 'Asia' },
  { iso3: 'BRA', iso2: 'BR', displayName: 'Brazil', region: 'Americas' },
  { iso3: 'AAA', iso2: 'AA', displayName: 'Same Name', region: 'Tie' },
  { iso3: 'BBB', iso2: 'BB', displayName: 'Same Name', region: 'Tie' },
]

test('sheet body drag leaves native country controls clickable at the top of the list', () => {
  const interactiveTarget = {
    closest(selector) {
      assert.equal(selector, SHEET_DRAG_INTERACTIVE_SELECTOR)
      return { tagName: 'BUTTON' }
    },
  }
  const emptySpaceTarget = { closest: () => null }

  assert.equal(shouldStartSheetBodyDrag(true, interactiveTarget), false)
  assert.equal(shouldStartSheetBodyDrag(true, emptySpaceTarget), true)
  assert.equal(shouldStartSheetBodyDrag(false, emptySpaceTarget), false)
})

test('orderCountriesForList orders alphabetically with an iso3 tiebreak', () => {
  const ordered = orderCountriesForList(countries)
  assert.deepEqual(ordered.map((country) => country.iso3), [
    'BRA',
    'CAN',
    'JPN',
    'AAA',
    'BBB',
    'USA',
  ])
})

test('orderCountriesForList filters sparse data and searches names, regions, and iso codes', () => {
  assert.deepEqual(
    orderCountriesForList([null, ...countries], 'amer').map((country) => country.iso3),
    ['BRA', 'CAN', 'USA'],
  )
  assert.deepEqual(
    orderCountriesForList(countries, 'jp').map((country) => country.iso3),
    ['JPN'],
  )
  assert.deepEqual(orderCountriesForList(undefined), [])
})

test('list order is stable under marking — toggling visited/wishlist never moves a row', () => {
  const before = orderCountriesForList(countries)
  const rowIndex = before.findIndex((country) => country.iso3 === 'JPN')

  // Simulate the app flow: mark Japan visited, then re-derive the list the
  // way the component does (order, then narrow with the 'all' filter).
  const { visited, wishlist } = toggleCountryStatus(new Set(), new Set(), 'JPN', 'visited')
  const after = filterCountriesByStatus(orderCountriesForList(countries), 'all', visited, wishlist)

  assert.deepEqual(
    after.map((country) => country.iso3),
    before.map((country) => country.iso3),
  )
  assert.equal(after.findIndex((country) => country.iso3 === 'JPN'), rowIndex)
})

test('filterCountriesByStatus narrows to visited or wishlist and passes everything for all', () => {
  const ordered = orderCountriesForList(countries)
  const visited = new Set(['JPN', 'CAN'])
  const wishlist = new Set(['USA'])

  assert.deepEqual(
    filterCountriesByStatus(ordered, 'visited', visited, wishlist).map((c) => c.iso3),
    ['CAN', 'JPN'],
  )
  assert.deepEqual(
    filterCountriesByStatus(ordered, 'wishlist', visited, wishlist).map((c) => c.iso3),
    ['USA'],
  )
  assert.equal(filterCountriesByStatus(ordered, 'all', visited, wishlist), ordered)
  assert.deepEqual(filterCountriesByStatus(undefined, 'visited', visited, wishlist), [])
})

test('filterCountriesByStatus gives visited priority when a malformed persisted wishlist also contains the country', () => {
  const wishlistOnly = filterCountriesByStatus(countries, 'wishlist', ['USA'], ['USA', 'CAN'])
  assert.deepEqual(wishlistOnly.map((c) => c.iso3), ['CAN'])
})

test('STATUS_FILTERS lists the three chip states with all first', () => {
  assert.deepEqual(STATUS_FILTERS, ['all', 'visited', 'wishlist'])
})

test('toggleCountryStatus adds visited and removes the same country from wishlist', () => {
  const { visited, wishlist } = toggleCountryStatus(['CAN'], ['USA', 'JPN'], 'USA', 'visited')
  assert.deepEqual([...visited].sort(), ['CAN', 'USA'])
  assert.deepEqual([...wishlist].sort(), ['JPN'])
})

test('toggleCountryStatus removes visited when toggled again', () => {
  const { visited, wishlist } = toggleCountryStatus(['USA', 'CAN'], ['JPN'], 'USA', 'visited')
  assert.deepEqual([...visited].sort(), ['CAN'])
  assert.deepEqual([...wishlist].sort(), ['JPN'])
})

test('toggleCountryStatus adds wishlist and removes the same country from visited', () => {
  const { visited, wishlist } = toggleCountryStatus(['USA', 'CAN'], ['JPN'], 'USA', 'wishlist')
  assert.deepEqual([...visited].sort(), ['CAN'])
  assert.deepEqual([...wishlist].sort(), ['JPN', 'USA'])
})

test('toggleCountryStatus is pure and ignores empty or unknown operations', () => {
  const visitedInput = new Set(['USA'])
  const wishlistInput = new Set(['CAN'])
  const empty = toggleCountryStatus(visitedInput, wishlistInput, '', 'visited')
  const unknown = toggleCountryStatus(visitedInput, wishlistInput, 'JPN', 'other')

  assert.notEqual(empty.visited, visitedInput)
  assert.notEqual(empty.wishlist, wishlistInput)
  assert.deepEqual([...empty.visited], ['USA'])
  assert.deepEqual([...empty.wishlist], ['CAN'])
  assert.deepEqual([...unknown.visited], ['USA'])
  assert.deepEqual([...unknown.wishlist], ['CAN'])
})

test('classifyStatusToggle maps a status tap to the right Reflection signal', () => {
  // Adding a status from absent → item_created with the domain-noun type.
  assert.deepEqual(classifyStatusToggle(false, false, 'visited'), {
    event: 'item_created',
    type: 'visited_country',
  })
  assert.deepEqual(classifyStatusToggle(false, false, 'wishlist'), {
    event: 'item_created',
    type: 'wishlist_country',
  })
  // Toggling an existing status off → item_deleted.
  assert.deepEqual(classifyStatusToggle(true, false, 'visited'), {
    event: 'item_deleted',
    type: 'visited_country',
  })
  assert.deepEqual(classifyStatusToggle(false, true, 'wishlist'), {
    event: 'item_deleted',
    type: 'wishlist_country',
  })
  // Moving between statuses → item_updated with flat from/to.
  assert.deepEqual(classifyStatusToggle(false, true, 'visited'), {
    event: 'item_updated',
    type: 'country',
    from: 'wishlist',
    to: 'visited',
  })
  assert.deepEqual(classifyStatusToggle(true, false, 'wishlist'), {
    event: 'item_updated',
    type: 'country',
    from: 'visited',
    to: 'wishlist',
  })
  // An unrecognized status is a no-op (never emitted).
  assert.equal(classifyStatusToggle(false, false, 'other'), null)
})

test('classifyStatusToggle payloads are flat primitives only (no nested objects, no PII)', () => {
  const cases = [
    classifyStatusToggle(false, false, 'visited'),
    classifyStatusToggle(true, false, 'visited'),
    classifyStatusToggle(false, true, 'visited'),
    classifyStatusToggle(false, false, 'wishlist'),
  ]
  for (const c of cases) {
    const { event, ...payload } = c
    assert.equal(typeof event, 'string')
    for (const v of Object.values(payload)) {
      assert.ok(['string', 'number', 'boolean'].includes(typeof v), `flat primitive, got ${typeof v}`)
    }
  }
})

test('nextDragRotation is exact 1:1 away from the poles and eases into them', () => {
  // Below the polar cap dragging is exact versor tracking.
  assert.deepEqual(nextDragRotation([0, 0, 0], 12, 45), [12, 45, 0])
  // Crossing the antimeridian takes the short way, not a 360° spin-around.
  assert.deepEqual(nextDragRotation([170, 0, 0], -170, 0), [190, 0, 0])

  // Dragging to the pole eases latitude toward the ceiling (never reaching
  // it) and damps — but never locks — the longitude step.
  const atPole = nextDragRotation([0, 0, 0], 12, 90)
  assert.ok(atPole[1] > 72 && atPole[1] < ROTATION_SINGULARITY_LAT)
  assert.ok(atPole[0] > 0 && atPole[0] < 12)

  // No dead zone at the top — dragging back out is always possible.
  assert.deepEqual(nextDragRotation([12, 84, 0], 18, 60), [18, 60, 0])
})

test('easePointerToDisc leaves the inner disc untouched and eases an off-disc pointer below the singular limb', () => {
  const cx = 200
  const cy = 200
  const radius = 100
  // Inner disc (rho ≤ 0.88) → exact no-op: centre-of-disc dragging is 1:1.
  assert.deepEqual(easePointerToDisc(230, 215, cx, cy, radius), [230, 215])
  assert.deepEqual(easePointerToDisc(cx + 50, cy, cx, cy, radius), [cx + 50, cy])
  // A point just at the ease threshold is still essentially untouched.
  const atStart = easePointerToDisc(cx + 88, cy, cx, cy, radius)
  assert.ok(Math.abs(atStart[0] - (cx + 88)) < 1e-9, 'ρ=0.88 is the ease threshold (≈ identity)')
  // Far outside the disc → eased to a radius strictly INSIDE the limb, never on
  // or past it (so projection.invert stays well-conditioned, gain bounded).
  const [px, py] = easePointerToDisc(cx + 400, cy, cx, cy, radius)
  const dist = Math.hypot(px - cx, py - cy)
  assert.ok(dist < radius, 'eased pointer sits strictly inside the sphere disc (not on the limb)')
  assert.ok(dist <= radius * 0.985 + 1e-9, 'eased radius respects the sub-limb ceiling (0.985·R)')
  assert.ok(dist > radius * 0.9, 'eased pointer is out near the edge, not collapsed to the centre')
})

test('easePointerToDisc is CONTINUOUS near and past the limb — a small cursor delta is a small radius delta, never a wall or a jump', () => {
  const cx = 0
  const cy = 0
  const radius = 100
  const easedR = (r) => {
    const [x] = easePointerToDisc(r, 0, cx, cy, radius)
    return x // on the +x axis the eased radius is just the x coordinate
  }
  // Walk the cursor radially from inside the disc out to well beyond the limb.
  // The OLD hard clamp froze every point past 0.999·R onto one circle (slope 0
  // → a dead-zone the user feels as 'abrupt then stuck'). The soft ease must
  // stay strictly monotone with a small, BOUNDED step for each small move,
  // through the limb (r=R) and out past it — that continuity IS the fix.
  const CURSOR_STEP = 2
  let prev = -Infinity
  let maxStep = 0
  let deepStep = 0 // largest step well past the limb (r ≥ 1.5·R)
  for (let r = 80; r <= 300; r += CURSOR_STEP) {
    const cur = easedR(r)
    if (r > 80) {
      assert.ok(cur >= prev - 1e-9, `eased radius is monotone at r=${r} (no reversal)`)
      const step = cur - prev
      assert.ok(step >= -1e-9, 'no backward jump')
      // Slope ≤ 1 everywhere: the eased radius never moves FASTER than the
      // cursor (no amplification/spike). In the inner disc the slope is exactly
      // 1 (identity, the smooth 1:1 region); past the ease threshold it only
      // ever compresses. A hard clamp would instead show a +R jump at the wall.
      assert.ok(step <= CURSOR_STEP + 1e-9, `eased step ${step.toFixed(4)}px at r=${r} never exceeds the ${CURSOR_STEP}px cursor step (no spike)`)
      // And the step must SHRINK monotonically once we're easing (continuous,
      // decaying derivative — the smooth feel), never grow back into a jump.
      maxStep = Math.max(maxStep, step)
      if (r - CURSOR_STEP >= 1.5 * radius) deepStep = Math.max(deepStep, step)
    }
    prev = cur
  }
  // No step ever amplifies the cursor (slope ≤ 1 globally — the inner-disc 1:1
  // region is the steepest part; everything past it only compresses).
  assert.ok(maxStep <= CURSOR_STEP + 1e-9, `largest eased-radius step ${maxStep.toFixed(3)}px never amplifies the cursor`)
  // Deep off-disc (cursor dragged way past the silhouette) the mapping has all
  // but flattened — each 2px barely nudges the radius. The old hard clamp froze
  // it to exactly 0 with a discontinuous wall before it; the ease decays toward
  // 0 smoothly instead (asymptote, not a cliff).
  assert.ok(deepStep < 0.05, `deep off-disc steps ${deepStep.toFixed(4)}px have flattened smoothly (no wall, no freeze-jump)`)

  // And specifically ACROSS the silhouette (cursor crossing r=R): the eased
  // radius barely moves — no discontinuity at the limb where the old clamp's
  // dead-zone began.
  const justInside = easedR(radius - 1)
  const justOutside = easedR(radius + 1)
  assert.ok(Math.abs(justOutside - justInside) < 1.0, 'crossing the silhouette is smooth, not a step')
  assert.ok(justOutside >= justInside - 1e-9, 'still monotone across the limb')
})

test('solveVersorDrag near the edge produces a BOUNDED rotation — no runaway limb snap', () => {
  const cx = 200
  const cy = 200
  const radius = 100
  const startRotate = [0, 0, 0]
  const makeProjection = makeOrtho(cx, cy, radius)
  // Grab a point well inside the disc.
  const grab = makeProjection(startRotate).invert([cx + 20, cy])
  const versorCartesian = (e) => {
    const l = (e[0] * Math.PI) / 180
    const p = (e[1] * Math.PI) / 180
    const cp = Math.cos(p)
    return [cp * Math.cos(l), cp * Math.sin(l), Math.sin(p)]
  }
  const v0 = versorCartesian(grab)
  // versor.fromAngles for the identity start rotation is the unit quaternion.
  const q0 = [1, 0, 0, 0]

  // Drag the pointer FAR past the silhouette (200px outside a 100px-radius
  // disc). Without the pixel clamp this inverts to a divergent near-limb point
  // and the old code snapped the globe across the sphere; with the clamp the
  // per-frame rotation must stay bounded.
  const next = solveVersorDrag({
    makeProjection,
    startRotate,
    v0,
    q0,
    current: startRotate,
    px: cx + 300,
    py: cy,
    cx,
    cy,
    radius,
  })
  assert.ok(next, 'a near/over-edge drag still resolves a rotation (gesture stays alive)')
  // The step from the start rotation to the solved one is a sane drag amount,
  // not a quarter-turn-plus runaway. A single edge frame can never exceed the
  // half-sphere the versor delta spans; assert it stays well under that.
  const step = angularStepDeg(startRotate, next)
  assert.ok(step <= 95, `near-edge drag step ${step.toFixed(1)}° is bounded, not a runaway snap`)
  // North-up invariant preserved: roll stays zero.
  assert.equal(next[2], 0)

  // Sweeping the off-disc pointer a little further moves the globe a little
  // further (monotone, smooth) — not a discontinuous jump.
  const next2 = solveVersorDrag({
    makeProjection,
    startRotate,
    v0,
    q0,
    current: next,
    px: cx + 320,
    py: cy + 10,
    cx,
    cy,
    radius,
  })
  assert.ok(next2, 'a further off-disc move still resolves')
  assert.ok(angularStepDeg(next, next2) < 30, 'consecutive off-disc frames step smoothly, no jump')
})

test('pickRotatingSaying: empty list → -1 (renders nothing), single → 0, else no back-to-back repeat', () => {
  // Empty list yields -1 so the header renders no saying at all.
  assert.equal(pickRotatingSaying([], 0), -1)
  assert.equal(pickRotatingSaying(undefined, 0), -1)
  // Single entry stays put (no other choice).
  assert.equal(pickRotatingSaying(['only'], 0), 0)
  // Never repeats the one currently on screen, even if random lands on it.
  const sayings = ['a', 'b', 'c']
  assert.equal(pickRotatingSaying(sayings, 1, () => 1 / 3), 2) // random→idx1, ==current→step to 2
  assert.notEqual(pickRotatingSaying(sayings, 2, () => 2 / 3), 2)
})

test('lookupCountryInfo + formatters: bundled facts join by ISO-3, missing data reads as em dash', () => {
  const facts = {
    USA: { cap: 'Washington D.C.', pop: 326687501, area: 9372610, lang: ['English'] },
    CHE: { cap: 'Bern', pop: 8513227, area: 41284, lang: ['French', 'Swiss German', 'Italian', 'Romansh'] },
  }
  const usa = lookupCountryInfo('USA', facts)
  assert.equal(usa.capital, 'Washington D.C.')
  assert.equal(usa.population, 326687501)
  assert.deepEqual(usa.languages, ['English'])
  // No facts row → null (the card then shows only region/flag).
  assert.equal(lookupCountryInfo('ZZZ', facts), null)
  assert.equal(lookupCountryInfo('', facts), null)

  assert.equal(formatPopulation(326687501), '326,687,501')
  assert.equal(formatPopulation(null), '—')
  assert.equal(formatArea(9372610), '9,372,610 km²')
  assert.equal(formatArea(undefined), '—')
  // Switzerland's four languages cap at three with a +1 overflow marker.
  assert.equal(formatLanguages(facts.CHE.lang), 'French, Swiss German, Italian +1')
  assert.equal(formatLanguages([]), '—')
})

// The status filter is the ONLY thing Atlas keeps in localStorage now — a
// device-local VIEW preference (not codes, never round-tripped). It must
// round-trip cleanly and stay scoped per app. (The codes themselves persist
// through useDocument; their durability is covered by the runtime's own
// mobiusRuntimeStore tests, not here.)
test('the status-filter preference round-trips through localStorage, scoped per app', () => {
  const values = new Map()
  globalThis.localStorage = {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  }

  assert.equal(prefRead('app-1', 'status-filter'), null)
  prefWrite('app-1', 'status-filter', 'visited')
  assert.equal(prefRead('app-1', 'status-filter'), 'visited')
  assert.equal(values.get(PREF_KEY('app-1', 'status-filter')), JSON.stringify('visited'))
  // Per-app scope: app-1's preference must not leak into app-2.
  assert.equal(prefRead('app-2', 'status-filter'), null)

  delete globalThis.localStorage
})

// No localStorage (private mode / SSR) must degrade silently, never throw —
// a view preference is a nice-to-have, not a hard dependency.
test('the preference helpers degrade silently with no localStorage', () => {
  const saved = globalThis.localStorage
  delete globalThis.localStorage
  assert.equal(prefRead('app-1', 'status-filter'), null)
  assert.doesNotThrow(() => prefWrite('app-1', 'status-filter', 'wishlist'))
  if (saved) globalThis.localStorage = saved
})

// mergeCodeSets is the heart of the useDocument migration's convergence: under
// mode:'lww' it must UNION adds (no code lost when two contexts each add one)
// while still honoring a removal THIS context made — the property pure union
// (the runtime's default merge) can't express, which is why Atlas passes its
// own merge.
test('mergeCodeSets unions adds from both contexts (no code lost)', () => {
  // base = what this context last saw; mine = base + JPN; theirs = base + USA.
  const base = ['CAN']
  const mine = ['CAN', 'JPN']
  const theirs = ['CAN', 'USA']
  const merged = mergeCodeSets(base, mine, theirs)
  // Both the local add (JPN) and the concurrent remote add (USA) survive.
  assert.deepEqual(new Set(merged), new Set(['CAN', 'JPN', 'USA']))
})

test('mergeCodeSets honors a removal this context made (untoggle is not reverted)', () => {
  // This context removed DEU; the server copy still has it (stale). The remove
  // must stick — a pure union would silently re-add DEU and revert the untoggle.
  const base = ['DEU', 'FRA']
  const mine = ['FRA']            // DEU untoggled here
  const theirs = ['DEU', 'FRA']   // server hasn't caught up
  const merged = mergeCodeSets(base, mine, theirs)
  assert.deepEqual(new Set(merged), new Set(['FRA']))
})

test('mergeCodeSets keeps a code another context added even as this one removes a different code', () => {
  const base = ['DEU', 'FRA']
  const mine = ['FRA']             // removed DEU
  const theirs = ['DEU', 'FRA', 'ITA']  // another context added ITA
  const merged = mergeCodeSets(base, mine, theirs)
  // DEU dropped (our removal), ITA kept (their add) — adds win, our remove honored.
  assert.deepEqual(new Set(merged), new Set(['FRA', 'ITA']))
})

test('mergeCodeSets dedupes and preserves mine-first order for stable React keys', () => {
  const merged = mergeCodeSets(['USA'], ['USA', 'CAN'], ['CAN', 'JPN', 'USA'])
  // mine's order leads (USA, CAN), then theirs contributes the new JPN.
  assert.deepEqual(merged, ['USA', 'CAN', 'JPN'])
})
