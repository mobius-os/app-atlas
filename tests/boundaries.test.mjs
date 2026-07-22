import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const countries = JSON.parse(
  readFileSync(new URL('../countries.geo.json', import.meta.url), 'utf8'),
)

function ringContains(ring, [x, y]) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const crosses = yi > y !== yj > y
    if (crosses && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function geometryContains(geometry, point) {
  const polygons = geometry.type === 'MultiPolygon'
    ? geometry.coordinates
    : [geometry.coordinates]
  return polygons.some((polygon) =>
    ringContains(polygon[0], point) &&
    !polygon.slice(1).some((hole) => ringContains(hole, point)),
  )
}

function countryAt(point) {
  return countries.find((country) => geometryContains(country.geometry, point)) || null
}

test('Somaliland territory is selectable as Somalia in the 195-country view', () => {
  assert.equal(countries.length, 195)
  assert.equal(countries.filter((country) => country.iso3 === 'SOM').length, 1)

  for (const point of [
    [44, 10],
    [46, 9.5],
    [48.2, 10.2],
  ]) {
    assert.equal(countryAt(point)?.iso3, 'SOM', `expected ${point.join(',')} to select Somalia`)
  }
})

test('Somalia carries the boundary status and source shown in its detail card', () => {
  const somalia = countries.find((country) => country.iso3 === 'SOM')
  assert.match(somalia.boundaryNote, /Somaliland.*self-governing.*claims independence/)
  assert.match(somalia.boundarySource, /OCHA Somalia COD-AB v03/)
})
