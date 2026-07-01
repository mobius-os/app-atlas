// Build-time generator for the bundled country-facts dataset.
//
// Atlas shows a basic-info card when a country is selected: capital,
// population, surface area, and main language(s). The app's geometry seed
// (countries.geo.json) carries only name/iso/flag/region/geometry, so these
// four facts must be JOINED from authoritative static datasets at BUILD TIME
// and bundled — Atlas runs under CSP connect-src 'self' and must never fetch
// an external API at runtime. This script is that build step.
//
// Sources (both static npm packages, public-domain / open data):
//   - world-countries  → capital, area (km²), main languages (ISO-keyed by
//     cca3/cca2; authoritative and current).
//   - country-json     → population (the one field world-countries omits).
//     country-json keys population by country NAME, so we join through
//     world-countries' common/official/altSpellings names, with a tiny
//     explicit override table for the handful of name mismatches.
//
// Output: country-facts.json — an object keyed by ISO-3, each value holding
// ONLY the four rendered fields under short keys to keep the bundle small:
//   { "<iso3>": { cap: <capital>, pop: <population>, area: <km²>, lang: [..] } }
//
// Run:  node scripts/build-country-facts.mjs
// country-facts.json is committed as the human-readable regeneration source,
// but Möbius mini-apps compile to a SINGLE file at install (esbuild on
// index.jsx alone — sibling imports don't resolve), so the LIVE data must be
// inlined in constants.js. This script therefore also rewrites the
// `const COUNTRY_FACTS = {...}` between the COUNTRY_FACTS:BEGIN/END markers in
// constants.js, keeping the app bundle and the const in lockstep with the
// JSON. Edit the data here, never by hand in constants.js.

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..')

const geo = JSON.parse(readFileSync(join(repoRoot, 'countries.geo.json'), 'utf8'))
const world = require('world-countries')
const populationRows = require('country-json/src/country-by-population.json')

const worldByCca3 = new Map(world.map((c) => [c.cca3, c]))
const worldByCca2 = new Map(world.map((c) => [c.cca2, c]))

// Population is name-keyed in country-json; normalize names to letters-only so
// "DR Congo" / "Congo (Dem. Rep.)" / "fiji islands" all collapse together.
const normalizeName = (value) => String(value || '').toLowerCase().replace(/[^a-z]/g, '')
const populationByName = new Map()
for (const row of populationRows) {
  if (typeof row.population === 'number') populationByName.set(normalizeName(row.country), row.population)
}

// Explicit population for the few ISO-3 codes whose names don't line up with
// any country-json row (verified by hand against the same dataset's spelling
// variants). Without these, population would silently render "—" for them.
const POPULATION_OVERRIDES = {
  COD: 84068091, // country-json: "The Democratic Republic of Congo"
  FJI: 883483,   // country-json: "Fiji Islands"
  TLS: 1267972,  // country-json: "East Timor"
}

const facts = {}
const missingWorld = []
const missingPopulation = []

for (const country of geo) {
  const iso3 = country.iso3
  const w = worldByCca3.get(iso3) || worldByCca2.get(country.iso2)
  if (!w) {
    missingWorld.push(`${iso3}/${country.iso2}/${country.displayName}`)
    continue
  }

  const capital = Array.isArray(w.capital) && w.capital.length ? w.capital[0] : ''
  const area = typeof w.area === 'number' ? w.area : null
  const languages = w.languages ? Object.values(w.languages) : []

  let population = POPULATION_OVERRIDES[iso3] ?? null
  if (population == null) {
    const candidates = [
      w.name?.common,
      w.name?.official,
      ...(w.altSpellings || []),
      country.name,
      country.displayName,
    ]
    for (const name of candidates) {
      const value = populationByName.get(normalizeName(name))
      if (value != null) {
        population = value
        break
      }
    }
  }
  if (population == null) missingPopulation.push(`${iso3}/${country.displayName}`)

  facts[iso3] = {
    cap: capital,
    pop: population,
    area,
    lang: languages,
  }
}

if (missingWorld.length) {
  // A geometry country with no world-countries match would render an empty
  // info card — fail loudly so a future geo-seed change can't ship that
  // silently.
  console.error('No world-countries match for:', missingWorld)
  process.exit(1)
}
if (missingPopulation.length) {
  console.warn('No population for (will render "—"):', missingPopulation)
}

// Compact (no pretty-print) — this object is inlined into the JS bundle.
const json = JSON.stringify(facts)
const bytes = Buffer.byteLength(json)

const out = join(repoRoot, 'country-facts.json')
writeFileSync(out, json)
console.log(`Wrote ${out} — ${Object.keys(facts).length} countries, ${bytes} bytes`)

// Inline the same data into constants.js between the markers so the bundled app
// keeps the generated facts in source_files. Fail loudly if the markers are
// missing rather than silently leaving constants.js stale.
const constantsPath = join(repoRoot, 'constants.js')
const constantsSrc = readFileSync(constantsPath, 'utf8')
const markerRe = /(\/\/ COUNTRY_FACTS:BEGIN[^\n]*\n)export const COUNTRY_FACTS = [\s\S]*?(\n\/\/ COUNTRY_FACTS:END)/
if (!markerRe.test(constantsSrc)) {
  console.error('constants.js is missing the COUNTRY_FACTS:BEGIN/END markers — cannot inline.')
  process.exit(1)
}
const nextConstants = constantsSrc.replace(markerRe, `$1export const COUNTRY_FACTS = ${json}$2`)
writeFileSync(constantsPath, nextConstants)
console.log(`Inlined COUNTRY_FACTS into ${constantsPath}`)
