import * as path from 'path'
import { loadScene } from './scene/SceneLoader'
import { FrameBuffer } from './renderer/FrameBuffer'
import { Presenter } from './renderer/Presenter'
import { RenderLoop } from './renderer/RenderLoop'
import { GlyphDB } from './glyph/GlyphDB'
import { GlyphCache } from './glyph/GlyphCache'
import { InputState } from './input/InputState'
import { KeyboardListener } from './input/KeyboardListener'
import { MouseListener } from './input/MouseListener'
import { CameraController } from './input/CameraController'
import { HUD } from './ui/HUD'

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('display') as HTMLCanvasElement

  // Fill window
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight

  const presenter = new Presenter(canvas)
  const { cols, rows } = presenter

  const scenePath = path.join(__dirname, '..', 'scenes', 'fp.json')
  const scene = loadScene(scenePath)

  const frameBuffer = new FrameBuffer(cols, rows)

  const dbPath = path.join(__dirname, '..', 'glyph_features.sqlite')

  let glyphCache: GlyphCache | null = null
  try {
    console.time('GlyphDB load')
    const db = new GlyphDB(dbPath)
    glyphCache = new GlyphCache(db)
    console.timeEnd('GlyphDB load')
  } catch (err) {
    console.warn('GlyphDB unavailable, falling back to ASCII ramp:', err)
  }

  const inputState = new InputState()
  new KeyboardListener(inputState, window)
  new MouseListener(inputState, canvas)

  const cameraController = new CameraController()
  const hud = new HUD()

  const loop = new RenderLoop(scene, frameBuffer, presenter, glyphCache, {
    targetFPS: 30,
    useTemporalReuse: true,
    useAdaptiveQuality: false,
    useWorkers: false,
    dbPath,
    inputState,
    cameraController,
    hud,
  })

  loop.start()
})
