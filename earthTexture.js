// NASA Blue Marble: Next Generation, October 2004, with topography and
// bathymetry. October is the closest match to the artifact reference's snow
// line, vegetation, land tones, and Atlantic seabed detail. The 5400×2700 NASA
// mosaic is encoded at 4096×2048/WebP q90 for a crisp globe, plus a 2048×1024
// variant for phones, where the full texture would cost about 32 MB of GPU
// memory once decoded.
// Source: https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography-bathymetry/
//
// Both files ship as storage seeds (mobius.json), like countries.geo.json, so
// they stay out of the JS bundle: the compiled module no longer carries a
// 1.4 MB data URL on every cold open, and the runtime's offline mirror keeps
// the texture available offline after its first read. Seeded names are
// versioned because an app update only adds seed keys that do not exist yet;
// a new texture must use a new name.
export const EARTH_TEXTURES = {
  full: 'textures/blue-marble-2004-10-4096.webp',
  phone: 'textures/blue-marble-2004-10-2048.webp',
}

// A phone-sized touch screen gets the 2048-wide texture; the globe there is
// at most about a thousand device pixels across. Anything else gets the full
// texture.
export function chooseEarthTexture({ coarsePointer, viewportMin }) {
  return coarsePointer && viewportMin < 600 ? EARTH_TEXTURES.phone : EARTH_TEXTURES.full
}

export function earthTextureForThisDevice() {
  if (typeof window === 'undefined') return EARTH_TEXTURES.full
  return chooseEarthTexture({
    coarsePointer: Boolean(window.matchMedia?.('(pointer: coarse)')?.matches),
    viewportMin: Math.min(window.innerWidth || 0, window.innerHeight || 0) || Infinity,
  })
}
