import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const countries = JSON.parse(
  readFileSync(new URL('../countries.geo.json', import.meta.url), 'utf8'),
)

function ringContains(ring, [x, y]) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

function geometryContains(geometry, point) {
  const polygons = geometry.type === 'MultiPolygon'
    ? geometry.coordinates
    : [geometry.coordinates]
  return polygons.some(
    (polygon) => ringContains(polygon[0], point)
      && !polygon.slice(1).some((hole) => ringContains(hole, point)),
  )
}

test('Somaliland-area taps resolve to Somalia without a competing country', () => {
  const points = [[44, 10], [45, 9.5], [46, 9.5], [47, 9], [48.2, 10.2]]
  for (const point of points) {
    const matches = countries
      .filter((country) => geometryContains(country.geometry, point))
      .map((country) => country.iso3)
    assert.deepEqual(matches, ['SOM'], `unexpected coverage at ${point.join(', ')}`)
  }
})

test('Somalia carries the owner-visible OCHA provenance note', () => {
  const somalia = countries.find((country) => country.iso3 === 'SOM')
  assert.match(somalia.boundaryNote, /Somaliland.*self-governing.*claims independence/)
  assert.match(somalia.boundarySource, /OCHA Field Information Services and HDX.*COD-AB v03.*8 Jan 2025.*30 Oct 2025/)
  assert.equal(somalia.boundarySourceUrl, 'https://data.humdata.org/dataset/cod-ab-som')
  assert.equal(somalia.boundaryLicense, 'CC BY 3.0 IGO')
  assert.equal(somalia.boundaryLicenseUrl, 'https://creativecommons.org/licenses/by/3.0/igo/')
  assert.match(somalia.boundaryChanges, /simplified and clipped.*Djibouti.*Ethiopia.*Kenya.*Somalia/)

  const sheet = readFileSync(new URL('../ui/BottomSheet.jsx', import.meta.url), 'utf8')
  assert.match(sheet, /<aside className="cb-boundary-note" aria-label="Boundary note">/)
  assert.match(sheet, /href=\{selectedCountry\.boundarySourceUrl\}/)
  assert.match(sheet, /href=\{selectedCountry\.boundaryLicenseUrl\}/)
  assert.match(sheet, /target="_blank"[\s\S]*?rel="noopener noreferrer"/)
  assert.ok(
    sheet.includes("String(selectedCountry.boundarySource).replace(/^Boundary:\\s*/i, '')"),
    'older persisted sources must not render a second Boundary label',
  )
})

test('the installed package advertises the third-party data license', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../mobius.json', import.meta.url), 'utf8'),
  )
  assert.equal(manifest.license, 'MIT AND CC-BY-3.0-IGO')
  assert.equal(manifest.storage_seeds['countries.geo.json'], 'countries.geo.json')

  // README does not ship as an app source. The actual distributed seed must
  // therefore carry every attribution element needed by the installed UI.
  const somalia = countries.find((country) => country.iso3 === 'SOM')
  for (const field of [
    'boundarySource',
    'boundarySourceUrl',
    'boundaryLicense',
    'boundaryLicenseUrl',
    'boundaryChanges',
  ]) {
    assert.ok(somalia[field], `missing shipped attribution field: ${field}`)
  }
})
