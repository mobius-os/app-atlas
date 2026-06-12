import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'

const esbuild = '/home/hmzmrzx/projects/mobius/frontend/node_modules/.bin/esbuild'
const nodePath = '/home/hmzmrzx/projects/mobius/frontend/node_modules'
mkdirSync(new URL('./.build/', import.meta.url), { recursive: true })
execFileSync(esbuild, [
  '--bundle',
  '--format=esm',
  '--jsx=automatic',
  '--platform=node',
  'index.jsx',
  '--outfile=tests/.build/index.mjs',
], {
  cwd: new URL('..', import.meta.url),
  env: { ...process.env, NODE_PATH: nodePath },
  stdio: 'pipe',
})

const {
  CACHE_KEY,
  LEGACY_CACHE_KEY,
  ROTATION_SINGULARITY_LAT,
  STATUS_FILTERS,
  cacheRead,
  cacheWrite,
  filterCountriesByStatus,
  nextDragRotation,
  orderCountriesForList,
  toggleCountryStatus,
} = await import('./.build/index.mjs')

const countries = [
  { iso3: 'USA', iso2: 'US', displayName: 'United States', region: 'Americas' },
  { iso3: 'CAN', iso2: 'CA', displayName: 'Canada', region: 'Americas' },
  { iso3: 'JPN', iso2: 'JP', displayName: 'Japan', region: 'Asia' },
  { iso3: 'BRA', iso2: 'BR', displayName: 'Brazil', region: 'Americas' },
  { iso3: 'AAA', iso2: 'AA', displayName: 'Same Name', region: 'Tie' },
  { iso3: 'BBB', iso2: 'BB', displayName: 'Same Name', region: 'Tie' },
]

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

test('cacheRead migrates the old Visited localStorage prefix to Atlas', () => {
  const values = new Map()
  globalThis.localStorage = {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, value),
  }
  values.set(LEGACY_CACHE_KEY('app-1', 'visited.json'), JSON.stringify(['USA', 'JPN']))

  assert.deepEqual(cacheRead('app-1', 'visited.json'), ['USA', 'JPN'])
  assert.equal(values.get(CACHE_KEY('app-1', 'visited.json')), JSON.stringify(['USA', 'JPN']))

  cacheWrite('app-1', 'visited.json', ['CAN'])
  assert.equal(values.get(CACHE_KEY('app-1', 'visited.json')), JSON.stringify(['CAN']))

  delete globalThis.localStorage
})
