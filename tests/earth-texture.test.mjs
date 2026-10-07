import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

function webpDimensions(bytes) {
  assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF')
  assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP')
  assert.equal(bytes.subarray(12, 16).toString('ascii'), 'VP8 ')
  // Lossy VP8 frame header: signature at bytes 23–25, then 14-bit dimensions.
  assert.deepEqual([...bytes.subarray(23, 26)], [0x9d, 0x01, 0x2a])
  return [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff]
}

test('the Earth textures are complete, bounded, and source-credited', () => {
  const full = readFileSync(new URL('assets/blue-marble-2004-10-4096.webp', root))
  const phone = readFileSync(new URL('assets/blue-marble-2004-10-2048.webp', root))
  assert.deepEqual(webpDimensions(full), [4096, 2048])
  assert.deepEqual(webpDimensions(phone), [2048, 1024])
  assert.ok(full.length < 1_100_000, 'full texture should stay below 1.1 MB')
  assert.ok(phone.length < 400_000, 'phone texture should stay below 400 KB')

  const loader = read('earthTexture.js')
  assert.match(loader, /NASA Blue Marble: Next Generation, October 2004/)
  assert.match(loader, /base-topography-bathymetry/)
  const readme = read('README.md')
  assert.match(readme, /NASA Earth Observatory/)
  assert.match(readme, /media usage guidelines/)
  assert.match(readme, /no endorsement by NASA is implied/i)
})

test('the Earth texture ships as storage seeds, never inside the JS bundle', async () => {
  const manifest = JSON.parse(read('mobius.json'))
  const { EARTH_TEXTURES } = await import(new URL('earthTexture.js', root))
  assert.equal(manifest.storage_seeds[EARTH_TEXTURES.full], 'assets/blue-marble-2004-10-4096.webp')
  assert.equal(manifest.storage_seeds[EARTH_TEXTURES.phone], 'assets/blue-marble-2004-10-2048.webp')
  for (const path of manifest.source_files) {
    assert.ok(statSync(new URL(path, root)).size < 200_000, `${path} should not embed texture data`)
  }
  assert.doesNotMatch(read('ui/Globe.jsx'), /data:image/)
})

test('phones get the 2048-wide texture and larger screens the full one', async () => {
  const { EARTH_TEXTURES, chooseEarthTexture } = await import(new URL('earthTexture.js', root))
  assert.equal(chooseEarthTexture({ coarsePointer: true, viewportMin: 390 }), EARTH_TEXTURES.phone)
  assert.equal(chooseEarthTexture({ coarsePointer: true, viewportMin: 820 }), EARTH_TEXTURES.full)
  assert.equal(chooseEarthTexture({ coarsePointer: false, viewportMin: 500 }), EARTH_TEXTURES.full)
})

test('the manifest ships every renderer source needed offline', () => {
  const manifest = JSON.parse(read('mobius.json'))
  for (const path of [
    'earthTexture.js',
    'ui/earthRenderer.js',
  ]) {
    assert.ok(manifest.source_files.includes(path), `missing source file: ${path}`)
  }
  assert.equal(manifest.offline_capable, true)
  assert.equal(manifest.offline.execution, 'full')
})

test('the photographic layer preserves the SVG fallback and interaction layer', () => {
  const globe = read('ui/Globe.jsx')
  const css = read('theme.js')
  assert.match(globe, /createEarthRenderer/)
  assert.match(globe, /earthPainted \? 'transparent' : 'url\(#cb-ocean\)'/)
  assert.match(globe, /cb-globe-svg--earth/)
  assert.match(globe, /onTapOcean\?\.\(\)/)
  assert.match(css, /\.cb-globe-svg:not\(\.cb-globe-svg--earth\) \.cb-country/)
  assert.match(css, /--cb-visited-overlay: rgb\(19 174 112 \/ 0\.30\)/)
  assert.match(css, /--cb-wishlist-overlay: rgb\(239 145 37 \/ 0\.34\)/)
})

test('motion defers country paths only when the canvas can preserve their outlines', () => {
  const globe = read('ui/Globe.jsx')
  const css = read('theme.js')
  const renderer = read('ui/earthRenderer.js')

  assert.match(
    globe,
    /const countryOverlayDeferred = spinning && earthPainted && earthOutlinesReady/,
  )
  assert.match(
    globe,
    /if \(countryOverlayDeferred\) return[\s\S]*?for \(const country of renderCountries\)/,
  )
  assert.match(globe, /<g className="cb-country-layer">\{countryNodes\}<\/g>/)
  assert.match(globe, /setCountryOutlines\([\s\S]*?normalizedCountries\.map/)
  assert.match(globe, /showCountryOutlines: countryOverlayDeferred/)
  assert.match(
    css,
    /\.cb-globe-svg--earth\.cb-globe-svg--moving \.cb-country-layer\s*\{\s*visibility: hidden;/,
  )
  assert.match(renderer, /setCountryOutlines\(geometries\)/)
  assert.match(renderer, /u_outline_strength/)
})
