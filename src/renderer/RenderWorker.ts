import { parentPort, workerData } from 'worker_threads'
import { Scene, GlyphCell } from '../core/types'
import { World } from './World'
import { createRay } from './Camera'
import { raymarch, DEFAULT_MAX_STEPS } from './Raymarch'
import { computeLighting } from './Lighting'
import { GlyphDB } from '../glyph/GlyphDB'
import { GlyphCache } from '../glyph/GlyphCache'
import { getMaxSteps } from './AdaptiveQuality'

interface Tile { x: number; y: number; width: number; height: number }
interface TileResult { tile: Tile; cells: GlyphCell[]; missCells: { x: number; y: number }[] }

const RAMP = ' .,:;=+*#%@'

let glyphCache: GlyphCache | null = null

function initGlyphCache(dbPath: string): void {
  try {
    const db = new GlyphDB(dbPath)
    glyphCache = new GlyphCache(db)
  } catch {
    glyphCache = null
  }
}

function getChar(brightness: number, normal: { x: number; y: number; z: number }, roughness: number): string {
  if (glyphCache) {
    const rec = glyphCache.select({
      targetCoverage: brightness,
      targetRoundness: Math.abs(normal.z),
      targetComplexity: roughness,
    })
    return rec.char
  }
  const idx = Math.floor(brightness * (RAMP.length - 1))
  return RAMP[Math.max(0, Math.min(RAMP.length - 1, idx))]
}

function renderTile(tile: Tile, scene: Scene, screenW: number, screenH: number): TileResult {
  const world = new World(scene.entities)
  const bg = scene.environment.backgroundColor

  const cells: GlyphCell[] = []
  const missCells: { x: number; y: number }[] = []

  for (let py = tile.y; py < tile.y + tile.height; py++) {
    for (let px = tile.x; px < tile.x + tile.width; px++) {
      const ray = createRay(scene.camera, px, py, screenW, screenH)
      const maxSteps = getMaxSteps(px, py, screenW, screenH)
      const result = raymarch(ray, world, maxSteps)

      if (result.hit) {
        const lit = computeLighting(result.position, result.normal, result.material, scene)
        const char = getChar(lit.brightness, result.normal, result.material.roughness)
        cells.push({ char, r: lit.r, g: lit.g, b: lit.b, brightness: lit.brightness })
      } else {
        missCells.push({ x: px, y: py })
        cells.push({ char: ' ', r: bg.r, g: bg.g, b: bg.b, brightness: 0 })
      }
    }
  }

  return { tile, cells, missCells }
}

// Initialize glyph cache if DB path provided
if (workerData?.dbPath) {
  initGlyphCache(workerData.dbPath)
}

parentPort!.on('message', (msg: { type: string; tile: Tile; scene: Scene; screenW: number; screenH: number }) => {
  if (msg.type === 'render_tile') {
    const result = renderTile(msg.tile, msg.scene, msg.screenW, msg.screenH)
    parentPort!.postMessage({ type: 'tile_result', ...result })
  }
})
