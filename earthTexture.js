import { EARTH_TEXTURE_DATA_A } from './earthTextureDataA.js'
import { EARTH_TEXTURE_DATA_B } from './earthTextureDataB.js'

// NASA Blue Marble: Next Generation, October 2004, with topography and
// bathymetry. October is the closest match to the artifact reference's snow
// line, vegetation, land tones, and Atlantic seabed detail. The 5400×2700 NASA
// mosaic is encoded at 4096×2048/WebP q90 for a crisp offline globe. Its data
// URL is split across two modules only because Atlas's install validator caps
// each individual source file at 1 MiB; the browser still decodes one image.
// Source: https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography-bathymetry/
export const BLUE_MARBLE_TEXTURE =
  `data:image/webp;base64,${EARTH_TEXTURE_DATA_A}${EARTH_TEXTURE_DATA_B}`
