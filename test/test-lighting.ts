import { computeLighting } from '../src/renderer/Lighting'
import { Scene } from '../src/core/types'

const scene: Scene = {
  time: 0,
  camera: { position: { x: 0, y: 2, z: 6 }, rotation: { x: 0, y: 0, z: 0 }, fov: 60, near: 0.1, far: 100 },
  environment: { ambientLight: 0.2, backgroundColor: { r: 0, g: 0, b: 0 } },
  lights: [{
    type: 'point',
    position: { x: 2, y: 3, z: 1 },
    intensity: 3,
    color: { r: 255, g: 180, b: 80 },
  }],
  entities: [],
}

const hitPos = { x: 0, y: 1, z: 1 }

// Normal pointing toward the light: (2-0, 3-1, 1-1) normalised ≈ (0.89, 0.45, 0)
const normalToLight = { x: 0.894, y: 0.447, z: 0 }
const material = { baseColor: { r: 255, g: 120, b: 50 }, brightness: 1, roughness: 0.5, reflectivity: 0 }

const litFacing = computeLighting(hitPos, normalToLight, material, scene)
console.log('Facing light:', litFacing)

// Normal pointing away from light
const normalAway = { x: -0.894, y: -0.447, z: 0 }
const litAway = computeLighting(hitPos, normalAway, material, scene)
console.log('Facing away:', litAway)

console.assert(litFacing.brightness > litAway.brightness, 'Facing light should be brighter')
console.assert(litFacing.r > litAway.r, 'Facing light should have more red')

// Emissive test: no lights, emissive=1
const sceneNoLights: Scene = { ...scene, lights: [] }
const emissiveMat = { ...material, emissive: 1.0 }
const litEmissive = computeLighting(hitPos, normalToLight, emissiveMat, sceneNoLights)
console.log('Emissive (no lights):', litEmissive)
console.assert(litEmissive.brightness > 0, 'Emissive material should be visible with no lights')

// Zero emissive
const noEmissiveMat = { ...material, emissive: 0 }
const litNoEmissive = computeLighting(hitPos, normalToLight, noEmissiveMat, sceneNoLights)
// Only ambient (0.2) — still some light
console.assert(litNoEmissive.brightness <= litEmissive.brightness, 'No emissive should be dimmer than emissive=1')

console.log('All lighting tests passed.')
