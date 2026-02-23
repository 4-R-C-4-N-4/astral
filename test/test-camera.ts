import { createRay } from '../src/renderer/Camera'
import { Camera } from '../src/core/types'

const cam: Camera = {
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  fov: 60,
  near: 0.1,
  far: 100,
}

const W = 40, H = 20

const center = createRay(cam, W / 2, H / 2, W, H)
console.log('Center ray direction:', JSON.stringify(center.direction))
// Should be approximately (0, 0, -1)

const topLeft = createRay(cam, 0, 0, W, H)
console.log('Top-left ray direction:', JSON.stringify(topLeft.direction))
// Should point up-left-forward

const bottomRight = createRay(cam, W - 1, H - 1, W, H)
console.log('Bottom-right ray direction:', JSON.stringify(bottomRight.direction))
// Should point down-right-forward
