import { loadScene } from '../src/scene/SceneLoader'
const scene = loadScene('scenes/test-sphere.json')
console.log(`Loaded scene with ${scene.entities.length} entities`)
console.log(`Camera at: ${JSON.stringify(scene.camera.position)}`)
console.log(`First entity: ${scene.entities[0].id} (${scene.entities[0].geometry.type})`)
