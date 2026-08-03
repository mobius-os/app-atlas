// Blue Marble canvas renderer. The SVG remains authoritative for country
// geometry, status overlays, hit-testing, keyboard access, and all gestures.
// During motion only, this layer also paints a prebuilt neutral border mask so
// the SVG paths can pause without making the geography disappear.

const VERTEX_SHADER = `
  attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`

const FRAGMENT_SHADER = `
  precision highp float;
  uniform sampler2D u_texture;
  uniform vec2 u_resolution;
  uniform vec2 u_center;
  uniform float u_radius;
  uniform mat3 u_camera_to_geo;
  uniform sampler2D u_country_outlines;
  uniform float u_outline_strength;

  const float PI = 3.141592653589793;

  void main() {
    vec2 point = (gl_FragCoord.xy - u_center) / u_radius;
    float radius2 = dot(point, point);
    if (radius2 > 1.0) discard;

    float z = sqrt(max(0.0, 1.0 - radius2));
    vec3 geo = normalize(u_camera_to_geo * vec3(point.x, point.y, z));
    float longitude = atan(geo.y, geo.x);
    float latitude = asin(clamp(geo.z, -1.0, 1.0));
    vec2 uv = vec2(longitude / (2.0 * PI) + 0.5, 0.5 - latitude / PI);

    vec4 color = texture2D(u_texture, uv);
    // A restrained darkening at the limb gives the flat mosaic volume without
    // laying a white shine veil over its geographic detail.
    float limb = 0.70 + 0.30 * sqrt(z);
    color.rgb *= limb;
    float outline = texture2D(u_country_outlines, uv).a;
    color.rgb = mix(color.rgb, vec3(0.051, 0.122, 0.141), outline * u_outline_strength);
    gl_FragColor = vec4(color.rgb, 1.0);
  }
`

const OUTLINE_WIDTH = 2048
const OUTLINE_HEIGHT = 1024

function drawOutlineRing(context, ring) {
  if (!Array.isArray(ring) || ring.length < 2) return
  let drawing = false
  let previousX = 0
  for (const coordinate of ring) {
    const longitude = Number(coordinate?.[0])
    const latitude = Number(coordinate?.[1])
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) continue
    const x = ((longitude + 180) / 360) * OUTLINE_WIDTH
    const y = ((90 - latitude) / 180) * OUTLINE_HEIGHT
    if (!drawing || Math.abs(x - previousX) > OUTLINE_WIDTH / 2) {
      if (drawing) context.stroke()
      context.beginPath()
      context.moveTo(x, y)
      drawing = true
    } else {
      context.lineTo(x, y)
    }
    previousX = x
  }
  if (drawing) context.stroke()
}

function createCountryOutlineAlpha(geometries) {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = OUTLINE_WIDTH
  canvas.height = OUTLINE_HEIGHT
  const context = canvas.getContext('2d')
  if (!context) return null
  context.clearRect(0, 0, OUTLINE_WIDTH, OUTLINE_HEIGHT)
  context.strokeStyle = '#fff'
  // At the default globe scale, 0.72 mask pixels project to the SVG overlay's
  // 0.48px boundary weight. Keeping that ratio avoids a visible weight change
  // when motion hands back to the settled interactive paths.
  context.lineWidth = 0.72
  context.lineJoin = 'round'
  context.lineCap = 'round'
  for (const geometry of geometries || []) {
    const polygons = geometry?.type === 'Polygon'
      ? [geometry.coordinates]
      : geometry?.type === 'MultiPolygon'
        ? geometry.coordinates
        : []
    for (const polygon of polygons) {
      for (const ring of polygon || []) drawOutlineRing(context, ring)
    }
  }
  const rgba = context.getImageData(0, 0, OUTLINE_WIDTH, OUTLINE_HEIGHT).data
  const alpha = new Uint8Array(OUTLINE_WIDTH * OUTLINE_HEIGHT)
  for (let source = 3, target = 0; target < alpha.length; source += 4, target += 1) {
    alpha[target] = rgba[source]
  }
  return alpha
}

function unitFromLonLat(lonLat) {
  const longitude = ((lonLat?.[0] || 0) * Math.PI) / 180
  const latitude = ((lonLat?.[1] || 0) * Math.PI) / 180
  const cosLat = Math.cos(latitude)
  return [
    cosLat * Math.cos(longitude),
    cosLat * Math.sin(longitude),
    Math.sin(latitude),
  ]
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function normalize(v) {
  const length = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / length, v[1] / length, v[2] / length]
}

function reject(v, axis) {
  const amount = dot(v, axis)
  return [
    v[0] - axis[0] * amount,
    v[1] - axis[1] * amount,
    v[2] - axis[2] * amount,
  ]
}

// Recover the projection's camera basis by asking d3 which geographic vectors
// sit at the centre, to the right, and above the globe. Sampling the projection
// itself avoids duplicating d3-geo's rotation convention in shader code and
// keeps the photograph locked exactly to the SVG boundaries at every pose.
export function cameraToGeoMatrix(projection, centerX, centerY, radius) {
  if (!projection?.invert || !(radius > 0)) return null
  const sample = radius * 0.5
  const center = projection.invert([centerX, centerY])
  const right = projection.invert([centerX + sample, centerY])
  const above = projection.invert([centerX, centerY - sample])
  if (!center || !right || !above) return null

  const z = normalize(unitFromLonLat(center))
  const x = normalize(reject(unitFromLonLat(right), z))
  const aboveWithoutZ = reject(unitFromLonLat(above), z)
  const y = normalize(reject(aboveWithoutZ, x))

  // WebGL matrices are column-major. gl_FragCoord's y axis points upward, so
  // the sampled "above" vector is the camera's positive-y basis directly.
  return new Float32Array([
    x[0], x[1], x[2],
    y[0], y[1], y[2],
    z[0], z[1], z[2],
  ])
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'shader compilation failed'
    gl.deleteShader(shader)
    throw new Error(message)
  }
  return shader
}

function createProgram(gl) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
  const program = gl.createProgram()
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  gl.deleteShader(vertex)
  gl.deleteShader(fragment)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || 'shader linking failed'
    gl.deleteProgram(program)
    throw new Error(message)
  }
  return program
}

export function createEarthRenderer(canvas, image) {
  if (!canvas || !image) return null
  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: false,
    depth: false,
    premultipliedAlpha: false,
  })
  if (!gl) return null

  const program = createProgram(gl)
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  )

  gl.useProgram(program)
  const position = gl.getAttribLocation(program, 'a_position')
  gl.enableVertexAttribArray(position)
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

  const texture = gl.createTexture()
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
  gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0)

  const outlineTexture = gl.createTexture()
  gl.activeTexture(gl.TEXTURE1)
  gl.bindTexture(gl.TEXTURE_2D, outlineTexture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texImage2D(
    gl.TEXTURE_2D, 0, gl.ALPHA, 1, 1, 0, gl.ALPHA, gl.UNSIGNED_BYTE,
    new Uint8Array([0]),
  )
  gl.uniform1i(gl.getUniformLocation(program, 'u_country_outlines'), 1)

  const resolutionLocation = gl.getUniformLocation(program, 'u_resolution')
  const centerLocation = gl.getUniformLocation(program, 'u_center')
  const radiusLocation = gl.getUniformLocation(program, 'u_radius')
  const matrixLocation = gl.getUniformLocation(program, 'u_camera_to_geo')
  const outlineStrengthLocation = gl.getUniformLocation(program, 'u_outline_strength')

  return {
    setCountryOutlines(geometries) {
      try {
        const alpha = createCountryOutlineAlpha(geometries)
        if (!alpha) return false
        gl.activeTexture(gl.TEXTURE1)
        gl.bindTexture(gl.TEXTURE_2D, outlineTexture)
        gl.texImage2D(
          gl.TEXTURE_2D, 0, gl.ALPHA, OUTLINE_WIDTH, OUTLINE_HEIGHT, 0,
          gl.ALPHA, gl.UNSIGNED_BYTE, alpha,
        )
        return gl.getError() === gl.NO_ERROR
      } catch {
        return false
      }
    },
    draw({ width, height, projection, radius, showCountryOutlines = false }) {
      if (!(width > 0) || !(height > 0) || !(radius > 0)) return false
      const pixelRatio = Math.min(
        typeof devicePixelRatio === 'number' ? devicePixelRatio : 1,
        2,
        1600 / Math.max(width, height),
      )
      const renderScale = Math.max(0.5, pixelRatio)
      const pixelWidth = Math.max(1, Math.round(width * renderScale))
      const pixelHeight = Math.max(1, Math.round(height * renderScale))
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth
        canvas.height = pixelHeight
      }

      const matrix = cameraToGeoMatrix(projection, width / 2, height / 2, radius)
      if (!matrix) return false

      gl.viewport(0, 0, pixelWidth, pixelHeight)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.useProgram(program)
      gl.uniform2f(resolutionLocation, pixelWidth, pixelHeight)
      gl.uniform2f(centerLocation, pixelWidth / 2, pixelHeight / 2)
      gl.uniform1f(radiusLocation, radius * renderScale)
      gl.uniformMatrix3fv(matrixLocation, false, matrix)
      gl.uniform1f(outlineStrengthLocation, showCountryOutlines ? 0.72 : 0)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      return gl.getError() === gl.NO_ERROR
    },
    destroy() {
      gl.deleteTexture(texture)
      gl.deleteTexture(outlineTexture)
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
    },
  }
}
