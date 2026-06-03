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

test('orderCountriesForList orders visited, wishlist, then rest alphabetically within each group', () => {
  const ordered = orderCountriesForList(
    countries,
    new Set(['JPN', 'CAN']),
    new Set(['USA']),
  )
  assert.deepEqual(ordered.map((country) => country.iso3), [
    'CAN',
    'JPN',
    'USA',
    'BRA',
    'AAA',
    'BBB',
  ])
})

test('orderCountriesForList filters sparse data and searches names, regions, and iso codes', () => {
  assert.deepEqual(
    orderCountriesForList([null, ...countries], [], [], 'amer').map((country) => country.iso3),
    ['BRA', 'CAN', 'USA'],
  )
  assert.deepEqual(
    orderCountriesForList(countries, [], [], 'jp').map((country) => country.iso3),
    ['JPN'],
  )
  assert.deepEqual(orderCountriesForList(undefined), [])
})

test('orderCountriesForList gives visited priority when a malformed persisted wishlist also contains the country', () => {
  const ordered = orderCountriesForList(countries, ['USA'], ['USA', 'CAN'])
  assert.deepEqual(ordered.slice(0, 2).map((country) => country.iso3), ['USA', 'CAN'])
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
