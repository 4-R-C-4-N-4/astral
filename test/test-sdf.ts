import { sdSphere, sdBox, sdPlane } from '../src/renderer/sdf'

function approx(a: number, b: number, tol = 1e-6): boolean {
  return Math.abs(a - b) < tol
}

// Sphere tests
console.assert(approx(sdSphere({ x: 0, y: 0, z: 0 }, 1), -1), `sdSphere center: expected -1, got ${sdSphere({ x: 0, y: 0, z: 0 }, 1)}`)
console.assert(approx(sdSphere({ x: 1, y: 0, z: 0 }, 1), 0), `sdSphere surface: expected 0, got ${sdSphere({ x: 1, y: 0, z: 0 }, 1)}`)
console.assert(approx(sdSphere({ x: 2, y: 0, z: 0 }, 1), 1), `sdSphere outside: expected 1, got ${sdSphere({ x: 2, y: 0, z: 0 }, 1)}`)

// Box test
const boxResult = sdBox({ x: 0, y: 0, z: 0 }, { x: 2, y: 2, z: 2 })
console.assert(approx(boxResult, -1), `sdBox center: expected -1, got ${boxResult}`)

// Plane test
const planeResult = sdPlane({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 })
console.assert(approx(planeResult, 1), `sdPlane: expected 1, got ${planeResult}`)

console.log('All SDF tests passed.')
