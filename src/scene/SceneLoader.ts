import * as fs from 'fs'
import { Scene, Entity, Camera, Environment, Light, Geometry } from '../core/types'

function validateVec3(obj: unknown, path: string): void {
  if (typeof obj !== 'object' || obj === null) {
    throw new Error(`${path} must be a Vec3 object`)
  }
  const v = obj as Record<string, unknown>
  if (typeof v.x !== 'number' || typeof v.y !== 'number' || typeof v.z !== 'number') {
    throw new Error(`${path} must have numeric x, y, z fields`)
  }
}

function validateCamera(cam: unknown): void {
  if (typeof cam !== 'object' || cam === null) {
    throw new Error("'camera' must be an object")
  }
  const c = cam as Record<string, unknown>
  validateVec3(c.position, 'camera.position')
  validateVec3(c.rotation, 'camera.rotation')
  if (typeof c.fov !== 'number') throw new Error("camera.fov must be a number")
  if (typeof c.near !== 'number') throw new Error("camera.near must be a number")
  if (typeof c.far !== 'number') throw new Error("camera.far must be a number")
}

function validateEnvironment(env: unknown): void {
  if (typeof env !== 'object' || env === null) {
    throw new Error("'environment' must be an object")
  }
  const e = env as Record<string, unknown>
  if (typeof e.ambientLight !== 'number') {
    throw new Error("environment.ambientLight must be a number")
  }
  if (typeof e.backgroundColor !== 'object' || e.backgroundColor === null) {
    throw new Error("environment.backgroundColor must be a Color object")
  }
}

function validateGeometry(geo: unknown, entityIdx: number): void {
  if (typeof geo !== 'object' || geo === null) {
    throw new Error(`Entity at index ${entityIdx} has invalid 'geometry'`)
  }
  const g = geo as Record<string, unknown>
  if (typeof g.type !== 'string') {
    throw new Error(`Entity at index ${entityIdx} geometry must have a 'type' string`)
  }
  const validTypes = ['sphere', 'box', 'plane', 'cylinder', 'sdf']
  if (!validTypes.includes(g.type)) {
    throw new Error(`Entity at index ${entityIdx} has unknown geometry type '${g.type}'`)
  }
}

function validateEntity(entity: unknown, idx: number): void {
  if (typeof entity !== 'object' || entity === null) {
    throw new Error(`Entity at index ${idx} is not an object`)
  }
  const e = entity as Record<string, unknown>
  if (typeof e.id !== 'string') {
    throw new Error(`Entity at index ${idx} is missing 'id'`)
  }
  if (typeof e.transform !== 'object' || e.transform === null) {
    throw new Error(`Entity at index ${idx} is missing 'transform'`)
  }
  if (e.geometry === undefined || e.geometry === null) {
    throw new Error(`Entity at index ${idx} is missing 'geometry'`)
  }
  validateGeometry(e.geometry, idx)
  if (typeof e.material !== 'object' || e.material === null) {
    throw new Error(`Entity at index ${idx} is missing 'material'`)
  }
}

export function loadScene(filePath: string): Scene {
  let raw: string
  try {
    raw = fs.readFileSync(filePath, 'utf-8')
  } catch (err) {
    throw new Error(`Failed to read scene file '${filePath}': ${err}`)
  }

  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch (err) {
    throw new Error(`Failed to parse scene JSON from '${filePath}': ${err}`)
  }

  if (typeof data !== 'object' || data === null) {
    throw new Error('Scene file must contain a JSON object at the top level')
  }

  const d = data as Record<string, unknown>

  if (d.camera === undefined) throw new Error("Scene is missing required field 'camera'")
  if (d.environment === undefined) throw new Error("Scene is missing required field 'environment'")
  if (d.lights === undefined) throw new Error("Scene is missing required field 'lights'")
  if (d.entities === undefined) throw new Error("Scene is missing required field 'entities'")

  validateCamera(d.camera)
  validateEnvironment(d.environment)

  if (!Array.isArray(d.lights)) throw new Error("Scene 'lights' must be an array")
  if (!Array.isArray(d.entities)) throw new Error("Scene 'entities' must be an array")

  d.entities.forEach((entity, idx) => validateEntity(entity, idx))

  const scene: Scene = {
    time: typeof d.time === 'number' ? d.time : 0,
    camera: d.camera as Camera,
    environment: d.environment as Environment,
    lights: d.lights as Light[],
    entities: (d.entities as Array<Record<string, unknown>>).map(e => ({
      ...e,
      velocity: e.velocity ?? undefined,
      angularVelocity: e.angularVelocity ?? undefined,
    })) as Entity[],
  }

  return scene
}
