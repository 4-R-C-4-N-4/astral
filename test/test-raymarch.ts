import { raymarch } from '../src/renderer/Raymarch'
import { World } from '../src/renderer/World'
import { loadScene } from '../src/scene/SceneLoader'

const scene = loadScene('scenes/test-sphere.json')
const world = new World(scene.entities)

// Fire a ray from (0, 1, 6) in direction (0, 0, -1) at the sphere at (0,1,0) r=1
const ray = {
  origin: { x: 0, y: 1, z: 6 },
  direction: { x: 0, y: 0, z: -1 },
}

const result = raymarch(ray, world)

if (result.hit) {
  console.log(`Hit at position: ${JSON.stringify(result.position)}`)
  console.log(`Normal: ${JSON.stringify(result.normal)}`)
  console.log(`Distance: ${result.distance}`)
  // Should hit at approximately (0, 1, 1) with normal (0, 0, 1), distance ≈ 5
  const distOk = Math.abs(result.distance - 5) < 0.05
  const normalOk = Math.abs(result.normal.z - 1) < 0.05
  console.assert(distOk, `Expected distance ≈ 5, got ${result.distance}`)
  console.assert(normalOk, `Expected normal.z ≈ 1, got ${result.normal.z}`)
  console.log('Raymarch test passed.')
} else {
  console.error('ERROR: Expected a hit but got miss!')
  process.exit(1)
}
