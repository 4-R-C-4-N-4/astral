import { World } from '../src/renderer/World'
import { Entity } from '../src/core/types'

function approx(a: number, b: number, tol = 1e-4): boolean {
  return Math.abs(a - b) < tol
}

// Sphere at position (0, 1, 0) with radius 1
const sphere: Entity = {
  id: 'sphere_1',
  transform: {
    position: { x: 0, y: 1, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  },
  geometry: { type: 'sphere', radius: 1 },
  material: {
    baseColor: { r: 255, g: 120, b: 50 },
    brightness: 1,
    roughness: 0.5,
    reflectivity: 0,
  },
}

const world = new World([sphere])

// Inside sphere center
const s1 = world.sample({ x: 0, y: 1, z: 0 })
console.assert(approx(s1.distance, -1), `Center: expected -1, got ${s1.distance}`)

// On surface
const s2 = world.sample({ x: 0, y: 2, z: 0 })
console.assert(approx(s2.distance, 0), `Surface: expected 0, got ${s2.distance}`)

// Outside
const s3 = world.sample({ x: 0, y: 3, z: 0 })
console.assert(approx(s3.distance, 1), `Outside: expected 1, got ${s3.distance}`)

console.log('All World tests passed.')
console.log(`Center distance: ${s1.distance}`)
console.log(`Surface distance: ${s2.distance}`)
console.log(`Outside distance: ${s3.distance}`)
