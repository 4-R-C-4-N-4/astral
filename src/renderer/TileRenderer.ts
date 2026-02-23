import { Worker } from 'worker_threads'
import * as os from 'os'
import * as path from 'path'
import { Scene, GlyphCell } from '../core/types'
import { FrameBuffer } from './FrameBuffer'

interface Tile { x: number; y: number; width: number; height: number }

const TILE_SIZE = 16

function generateTiles(screenW: number, screenH: number): Tile[] {
  const tiles: Tile[] = []
  for (let y = 0; y < screenH; y += TILE_SIZE) {
    for (let x = 0; x < screenW; x += TILE_SIZE) {
      tiles.push({
        x, y,
        width: Math.min(TILE_SIZE, screenW - x),
        height: Math.min(TILE_SIZE, screenH - y),
      })
    }
  }
  return tiles
}

interface WorkerState {
  worker: Worker
  busy: boolean
}

export class TileRenderer {
  private workers: WorkerState[]
  readonly workerCount: number

  constructor(dbPath?: string) {
    this.workerCount = Math.max(1, (os.cpus().length - 1))
    this.workers = []
    const workerScript = path.join(__dirname, 'RenderWorker.js')
    for (let i = 0; i < this.workerCount; i++) {
      const w = new Worker(workerScript, { workerData: { dbPath } })
      this.workers.push({ worker: w, busy: false })
    }
  }

  async renderFrame(scene: Scene, frameBuffer: FrameBuffer): Promise<void> {
    const { width, height } = frameBuffer
    const tiles = generateTiles(width, height)
    const sceneData = JSON.parse(JSON.stringify(scene)) as Scene  // structured-clone via JSON

    const promises: Promise<void>[] = []
    for (let i = 0; i < tiles.length; i++) {
      const ws = this.workers[i % this.workerCount]
      promises.push(this.dispatchTile(ws, tiles[i], sceneData, width, height, frameBuffer))
    }

    await Promise.all(promises)
  }

  private dispatchTile(
    ws: WorkerState,
    tile: Tile,
    scene: Scene,
    screenW: number,
    screenH: number,
    frameBuffer: FrameBuffer
  ): Promise<void> {
    return new Promise(resolve => {
      ws.worker.postMessage({ type: 'render_tile', tile, scene, screenW, screenH })
      ws.worker.once('message', (msg: { type: string; tile: Tile; cells: GlyphCell[] }) => {
        if (msg.type === 'tile_result') {
          this.writeTileToBuffer(msg.tile, msg.cells, frameBuffer)
        }
        resolve()
      })
    })
  }

  private writeTileToBuffer(tile: Tile, cells: GlyphCell[], frameBuffer: FrameBuffer): void {
    let i = 0
    for (let py = tile.y; py < tile.y + tile.height; py++) {
      for (let px = tile.x; px < tile.x + tile.width; px++, i++) {
        const cell = cells[i]
        frameBuffer.set(px, py, cell.char.codePointAt(0)!, cell.r, cell.g, cell.b, cell.brightness)
      }
    }
  }

  terminate(): void {
    for (const ws of this.workers) {
      ws.worker.terminate()
    }
  }
}
