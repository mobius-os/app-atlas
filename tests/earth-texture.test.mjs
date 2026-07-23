import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

function exportedPayload(path, name) {
  const source = read(path)
  const match = source.match(new RegExp(`export const ${name} = '([^']*)'`))
  assert.ok(match, `${path} must export one quoted payload`)
  return match[1]
}

function webpDimensions(bytes) {
  assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF')
  assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP')
  assert.equal(bytes.subarray(12, 16).toString('ascii'), 'VP8 ')
  // Lossy VP8 frame header: signature at bytes 23–25, then 14-bit dimensions.
  assert.deepEqual([...bytes.subarray(23, 26)], [0x9d, 0x01, 0x2a])
  return [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff]
}

test('the offline Earth texture is complete, bounded, and source-credited', () => {
  const a = exportedPayload('earthTextureDataA.js', 'EARTH_TEXTURE_DATA_A')
  const b = exportedPayload('earthTextureDataB.js', 'EARTH_TEXTURE_DATA_B')
  const texture = Buffer.from(a + b, 'base64')

  assert.deepEqual(webpDimensions(texture), [4096, 2048])
  assert.ok(texture.length < 1_100_000, 'decoded texture should stay below 1.1 MB')
  for (const path of ['earthTextureDataA.js', 'earthTextureDataB.js']) {
    assert.ok(statSync(new URL(path, root)).size < 1_000_000, `${path} exceeds source-file cap`)
  }

  const loader = read('earthTexture.js')
  assert.match(loader, /NASA Blue Marble: Next Generation, October 2004/)
  assert.match(loader, /base-topography-bathymetry/)
  const readme = read('README.md')
  assert.match(readme, /NASA Earth Observatory/)
  assert.match(readme, /media usage guidelines/)
  assert.match(readme, /no endorsement by NASA is implied/i)
})

test('the manifest ships every renderer source needed offline', () => {
  const manifest = JSON.parse(read('mobius.json'))
  for (const path of [
    'earthTexture.js',
    'earthTextureDataA.js',
    'earthTextureDataB.js',
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
