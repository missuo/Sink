import type { GeoProjection } from 'd3-geo'
import type { CountryColorTiers, HeatmapColorTiers } from './types'
import type { GeoJSONData, LocationData } from '@/types'
import { scaleThreshold } from 'd3-scale'

// Hex grid constants (flat-top hexagons)
// hexSize=9 gives ~40k hexes globally, close to H3 resolution 3
const HEX_SIZE = 9
const HEX_MARGIN = 0.2

const HEX_ANGLES = Array.from({ length: 6 }, (_, i) => {
  const angle = (Math.PI / 3) * i
  return [Math.cos(angle), Math.sin(angle)] as const
})

export async function createCountryTexture(
  gl: WebGLRenderingContext,
  countries: GeoJSONData,
  countryStats: Map<string, number>,
  maxVisits: number,
  tiers: CountryColorTiers,
  globeFill: string,
  locations: LocationData[],
  highest: number,
  heatmapTiers: HeatmapColorTiers,
): Promise<WebGLTexture | null> {
  const { geoPath, geoEquirectangular } = await import('d3-geo')

  const maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number
  const width = Math.min(4096, maxSize)
  const height = width / 2

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = globeFill
  ctx.fillRect(0, 0, width, height)

  const projection = geoEquirectangular()
    .scale(width / (2 * Math.PI))
    .translate([width / 2, height / 2])

  const pathGen = geoPath(projection)

  // Country lookup texture: each country drawn with unique color encoding its index
  const lookupCanvas = document.createElement('canvas')
  lookupCanvas.width = width
  lookupCanvas.height = height
  const lookupCtx = lookupCanvas.getContext('2d')!

  lookupCtx.fillStyle = 'rgb(0, 0, 0)'
  lookupCtx.fillRect(0, 0, width, height)

  const features = countries.features
  for (let i = 0; i < features.length; i++) {
    const id = i + 1
    lookupCtx.fillStyle = `rgb(${id & 0xFF}, ${(id >> 8) & 0xFF}, 0)`
    lookupCtx.beginPath()
    pathGen.context(lookupCtx)(features[i] as any)
    lookupCtx.fill()
  }

  const lookupData = lookupCtx.getImageData(0, 0, width, height).data

  // Country color map from visit tiers
  const tierScale = scaleThreshold<number, string>()
    .domain([1, maxVisits * 0.33, maxVisits * 0.66])
    .range([tiers.noData, tiers.tier1, tiers.tier2, tiers.tier3])

  const countryColorMap = new Map<number, string>()
  for (let i = 0; i < features.length; i++) {
    const props = (features[i] as any)?.properties
    const countryCode = props?.ISO_A2 || props?.iso_a2 || ''
    const count = countryStats.get(countryCode) || 0
    countryColorMap.set(i, tierScale(count))
  }

  // Generate hex grid grouped by color for batch rendering
  drawHexGrid(ctx, width, height, lookupData, countryColorMap, tiers.noData)

  // Heatmap overlay from location density
  if (locations.length > 0 && highest > 0) {
    drawHeatmapHexes(ctx, width, height, projection, locations, highest, heatmapTiers)
  }

  return createGLTexture(gl, canvas)
}

function drawHexGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  lookupData: Uint8ClampedArray,
  countryColorMap: Map<number, string>,
  noDataColor: string,
) {
  const drawRadius = HEX_SIZE * (1 - HEX_MARGIN)
  const colSpacing = 1.5 * HEX_SIZE
  const rowSpacing = Math.sqrt(3) * HEX_SIZE
  const halfRowSpacing = rowSpacing / 2
  const numCols = Math.ceil(width / colSpacing) + 1
  const numRows = Math.ceil(height / rowSpacing) + 1

  const hexesByColor = new Map<string, number[]>()

  for (let col = 0; col < numCols; col++) {
    const isOddCol = col & 1
    for (let row = 0; row < numRows; row++) {
      const cx = col * colSpacing
      const cy = row * rowSpacing + (isOddCol ? halfRowSpacing : 0)

      if (cx >= width || cy >= height)
        continue

      const px = Math.min(Math.floor(cx), width - 1)
      const py = Math.min(Math.floor(cy), height - 1)
      const idx = (py * width + px) * 4
      const countryIdx = (lookupData[idx]! | (lookupData[idx + 1]! << 8)) - 1

      if (countryIdx < 0)
        continue

      const color = countryColorMap.get(countryIdx) || noDataColor
      let coords = hexesByColor.get(color)
      if (!coords) {
        coords = []
        hexesByColor.set(color, coords)
      }
      coords.push(cx, cy)
    }
  }

  for (const [color, coords] of hexesByColor) {
    drawHexBatch(ctx, coords, drawRadius, color)
  }
}

function drawHeatmapHexes(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  projection: GeoProjection,
  locations: LocationData[],
  highest: number,
  heatmapTiers: HeatmapColorTiers,
) {
  const drawRadius = HEX_SIZE * (1 - HEX_MARGIN)
  const colSpacing = 1.5 * HEX_SIZE
  const rowSpacing = Math.sqrt(3) * HEX_SIZE
  const halfRowSpacing = rowSpacing / 2

  const projectedLocs: { px: number, py: number, count: number }[] = []
  for (const loc of locations) {
    const projected = projection([loc.lng, loc.lat])
    if (!projected)
      continue
    projectedLocs.push({ px: projected[0], py: projected[1], count: loc.count })
  }

  const influenceRadius = colSpacing * 1.5
  const influenceRadiusSq = influenceRadius * influenceRadius

  const heatTierScale = scaleThreshold<number, string>()
    .domain([highest * 0.05, highest * 0.15, highest * 0.35, highest * 0.65])
    .range([heatmapTiers.tier1, heatmapTiers.tier2, heatmapTiers.tier3, heatmapTiers.tier4, heatmapTiers.tier5])

  const heatHexesByColor = new Map<string, number[]>()
  const numCols = Math.ceil(width / colSpacing) + 1
  const numRows = Math.ceil(height / rowSpacing) + 1

  for (let col = 0; col < numCols; col++) {
    const isOddCol = col & 1
    for (let row = 0; row < numRows; row++) {
      const cx = col * colSpacing
      const cy = row * rowSpacing + (isOddCol ? halfRowSpacing : 0)

      if (cx >= width || cy >= height)
        continue

      let density = 0
      for (const loc of projectedLocs) {
        const dx = cx - loc.px
        const dy = cy - loc.py
        const distSq = dx * dx + dy * dy
        if (distSq < influenceRadiusSq) {
          density += loc.count * (1 - Math.sqrt(distSq) / influenceRadius)
        }
      }

      if (density <= 0)
        continue

      const color = heatTierScale(density)
      let coords = heatHexesByColor.get(color)
      if (!coords) {
        coords = []
        heatHexesByColor.set(color, coords)
      }
      coords.push(cx, cy)
    }
  }

  for (const [color, coords] of heatHexesByColor) {
    drawHexBatch(ctx, coords, drawRadius, color)
  }
}

// Batch-draw flat-top hexagons at given coordinates
function drawHexBatch(ctx: CanvasRenderingContext2D, coords: number[], radius: number, color: string) {
  ctx.fillStyle = color
  ctx.beginPath()
  for (let i = 0; i < coords.length; i += 2) {
    const cx = coords[i]!
    const cy = coords[i + 1]!
    const [cos0, sin0] = HEX_ANGLES[0]!
    ctx.moveTo(cx + radius * cos0, cy + radius * sin0)
    for (let v = 1; v < 6; v++) {
      const [cos, sin] = HEX_ANGLES[v]!
      ctx.lineTo(cx + radius * cos, cy + radius * sin)
    }
    ctx.closePath()
  }
  ctx.fill()
}

function createGLTexture(gl: WebGLRenderingContext, canvas: HTMLCanvasElement): WebGLTexture | null {
  const texture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  return texture
}
