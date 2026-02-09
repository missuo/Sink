import { geoDistance, geoInterpolate } from 'd3-geo'

// Octahedron sphere tessellation for smooth globe mesh
export function createOctahedronSphere(divisions: number) {
  const initialPoints: number[] = [
    0,
    1,
    0,
    0,
    0,
    -1,
    -1,
    0,
    0,
    0,
    1,
    0,
    -1,
    0,
    0,
    0,
    0,
    1,
    0,
    1,
    0,
    0,
    0,
    1,
    1,
    0,
    0,
    0,
    1,
    0,
    1,
    0,
    0,
    0,
    0,
    -1,
    0,
    -1,
    0,
    -1,
    0,
    0,
    0,
    0,
    -1,
    0,
    -1,
    0,
    0,
    0,
    1,
    -1,
    0,
    0,
    0,
    -1,
    0,
    1,
    0,
    0,
    0,
    0,
    1,
    0,
    -1,
    0,
    0,
    0,
    -1,
    1,
    0,
    0,
  ]

  let points = new Float32Array(initialPoints)

  for (let i = 0; i < divisions; i++) {
    const newPoints = new Float32Array(points.length * 4)
    let offset = 0

    for (let j = 0; j < points.length; j += 9) {
      const a: [number, number, number] = [points[j]!, points[j + 1]!, points[j + 2]!]
      const b: [number, number, number] = [points[j + 3]!, points[j + 4]!, points[j + 5]!]
      const c: [number, number, number] = [points[j + 6]!, points[j + 7]!, points[j + 8]!]

      const ab = normalizeVec3([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2])
      const bc = normalizeVec3([(b[0] + c[0]) / 2, (b[1] + c[1]) / 2, (b[2] + c[2]) / 2])
      const ca = normalizeVec3([(c[0] + a[0]) / 2, (c[1] + a[1]) / 2, (c[2] + a[2]) / 2])

      newPoints.set([...a, ...ab, ...ca], offset)
      offset += 9
      newPoints.set([...ab, ...bc, ...ca], offset)
      offset += 9
      newPoints.set([...ab, ...b, ...bc], offset)
      offset += 9
      newPoints.set([...ca, ...bc, ...c], offset)
      offset += 9
    }

    points = newPoints
  }

  // Build indexed mesh (triangle-at-a-time for proper seam/pole handling)
  const vertexMap = new Map<string, number>()
  const positions: number[] = []
  const texcoords: number[] = []
  const indices: number[] = []

  for (let tri = 0; tri < points.length; tri += 9) {
    const triVerts: [number, number, number][] = []
    const triUVs: [number, number][] = []

    for (let v = 0; v < 3; v++) {
      const p: [number, number, number] = [
        points[tri + v * 3]!,
        points[tri + v * 3 + 1]!,
        points[tri + v * 3 + 2]!,
      ]
      triVerts.push(p)
      triUVs.push(uvFromPoint(p))
    }

    // Fix poles: at poles atan2 is undefined, use average u from other verts
    for (let v = 0; v < 3; v++) {
      if (Math.abs(triVerts[v]![1]) > 0.999) {
        const otherUs = triUVs.filter((_, i) => i !== v).map(uv => uv[0])
        triUVs[v]![0] = (otherUs[0]! + otherUs[1]!) / 2
      }
    }

    // Fix seam: if triangle spans the dateline (u range > 0.5), wrap low values
    const us = triUVs.map(uv => uv[0])
    const maxU = Math.max(...us)
    const minU = Math.min(...us)
    if (maxU - minU > 0.5) {
      for (const uv of triUVs) {
        if (uv[0] < 0.25)
          uv[0] += 1.0
      }
    }

    for (let v = 0; v < 3; v++) {
      const p = triVerts[v]!
      const uv = triUVs[v]!
      const key = `${p[0].toFixed(6)},${p[1].toFixed(6)},${p[2].toFixed(6)},${uv[0].toFixed(6)},${uv[1].toFixed(6)}`

      let index = vertexMap.get(key)
      if (index === undefined) {
        index = positions.length / 3
        vertexMap.set(key, index)
        positions.push(...p)
        texcoords.push(...uv)
      }
      indices.push(index)
    }
  }

  return {
    position: new Float32Array(positions),
    texcoord: new Float32Array(texcoords),
    indices: new Uint16Array(indices),
  }
}

// Great-circle arc geometry via d3-geo interpolation (ribbon for visible width)
export function createArcGeometry(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
  segments: number = 50,
  progress: number = 1,
  ribbonHalfWidth: number = 0.002,
): { positions: Float32Array, alphas: Float32Array, dashParams: Float32Array } {
  const interpolate = geoInterpolate([startLng, startLat], [endLng, endLat])
  const angle = geoDistance([startLng, startLat], [endLng, endLat])

  // First pass: compute center line points
  const numSegments = Math.floor(segments * progress)
  const center: { x: number, y: number, z: number, t: number }[] = []

  for (let i = 0; i <= numSegments; i++) {
    const t = i / segments
    const [lng, lat] = interpolate(t)
    const point = latLngToXYZ(lat!, lng!, 1.0)

    // Lift arc above sphere surface
    const lift = Math.sin(t * Math.PI) * 0.08 * (angle / Math.PI)
    const len = Math.sqrt(point[0] ** 2 + point[1] ** 2 + point[2] ** 2)
    const scale = (1.008 + lift) / len
    center.push({ x: point[0] * scale, y: point[1] * scale, z: point[2] * scale, t })
  }

  if (center.length < 2) {
    return {
      positions: new Float32Array(0),
      alphas: new Float32Array(0),
      dashParams: new Float32Array(0),
    }
  }

  // Second pass: expand center line into ribbon (triangle strip)
  const positions: number[] = []
  const alphas: number[] = []
  const dashParams: number[] = []

  for (let i = 0; i < center.length; i++) {
    const p = center[i]!

    // Tangent direction along the arc
    let tx: number, ty: number, tz: number
    if (i === 0) {
      const n = center[1]!
      tx = n.x - p.x
      ty = n.y - p.y
      tz = n.z - p.z
    }
    else if (i === center.length - 1) {
      const prev = center[i - 1]!
      tx = p.x - prev.x
      ty = p.y - prev.y
      tz = p.z - prev.z
    }
    else {
      const prev = center[i - 1]!
      const n = center[i + 1]!
      tx = n.x - prev.x
      ty = n.y - prev.y
      tz = n.z - prev.z
    }

    // Side = cross(tangent, radial), normalized, gives perpendicular ribbon direction
    let sx = ty * p.z - tz * p.y
    let sy = tz * p.x - tx * p.z
    let sz = tx * p.y - ty * p.x
    const sLen = Math.sqrt(sx * sx + sy * sy + sz * sz)
    if (sLen > 0) {
      sx /= sLen
      sy /= sLen
      sz /= sLen
    }

    const alpha = Math.sin(p.t * Math.PI)

    // Two vertices per arc point (left / right of center)
    positions.push(
      p.x + sx * ribbonHalfWidth,
      p.y + sy * ribbonHalfWidth,
      p.z + sz * ribbonHalfWidth,
      p.x - sx * ribbonHalfWidth,
      p.y - sy * ribbonHalfWidth,
      p.z - sz * ribbonHalfWidth,
    )
    alphas.push(alpha, alpha)
    dashParams.push(p.t, p.t)
  }

  return {
    positions: new Float32Array(positions),
    alphas: new Float32Array(alphas),
    dashParams: new Float32Array(dashParams),
  }
}

export function latLngToXYZ(lat: number, lng: number, radius: number): [number, number, number] {
  const latRad = (lat * Math.PI) / 180
  const lngRad = (lng * Math.PI) / 180
  return [
    radius * Math.cos(latRad) * Math.sin(lngRad),
    radius * Math.sin(latRad),
    radius * Math.cos(latRad) * Math.cos(lngRad),
  ]
}

function normalizeVec3(v: number[]): [number, number, number] {
  const len = Math.sqrt(v[0]! * v[0]! + v[1]! * v[1]! + v[2]! * v[2]!)
  return [v[0]! / len, v[1]! / len, v[2]! / len]
}

function uvFromPoint(p: number[]): [number, number] {
  return [
    (Math.atan2(p[0]!, p[2]!) / (2 * Math.PI)) + 0.5,
    1.0 - ((Math.asin(p[1]!) / Math.PI) + 0.5),
  ]
}
