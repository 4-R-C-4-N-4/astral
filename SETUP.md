# ASCII Renderer — Implementation Steps 1–10

Each step below is a self-contained task. Complete them in order. Each step states what to build, where to put it, and how to verify it works.

---

## Step 1: Project Scaffolding

**Goal:** Initialize an Electron + TypeScript project with the right folder structure.

**Do this:**

1. Create a new directory `ascii-renderer/`
2. Run `npm init -y`
3. Install dependencies:
   ```bash
   npm install electron typescript better-sqlite3
   npm install -D @types/better-sqlite3 ts-node
   ```
4. Create `tsconfig.json`:
   ```json
   {
     "compilerOptions": {
       "target": "ES2022",
       "module": "commonjs",
       "strict": true,
       "esModuleInterop": true,
       "outDir": "dist",
       "rootDir": "src",
       "resolveJsonModule": true,
       "declaration": true
     },
     "include": ["src/**/*"]
   }
   ```
5. Create the directory structure:
   ```
   src/
   ├── main.ts              (Electron main process)
   ├── core/
   │   └── types.ts
   ├── scene/
   │   └── SceneLoader.ts
   ├── renderer/
   │   ├── FrameBuffer.ts
   │   ├── Camera.ts
   │   ├── Raymarch.ts
   │   ├── Lighting.ts
   │   ├── World.ts
   │   ├── sdf.ts
   │   └── Presenter.ts
   └── glyph/
       ├── GlyphDB.ts
       └── GlyphCache.ts
   ```
6. Create a minimal `src/main.ts` that opens an Electron BrowserWindow and loads a basic HTML page with a `<pre id="display">` element styled with a monospace font, black background, and white text.

**Verify:** `npx electron .` opens a window with a blank black screen and the `<pre>` element visible.

---

## Step 2: Core Types

**Goal:** Define all data types as plain TypeScript interfaces in a single file.

**File:** `src/core/types.ts`

**Do this:** Define these interfaces/types. Use interfaces, not classes. Everything must be JSON-serializable.

```ts
export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface Color {
  r: number
  g: number
  b: number
}

export interface Camera {
  position: Vec3
  rotation: Vec3
  fov: number
  near: number
  far: number
}

export interface Environment {
  ambientLight: number        // 0–1
  backgroundColor: Color
  fogDensity?: number
  fogColor?: Color
  globalIllumination?: number
}

export interface FlickerBehavior {
  speed: number
  amplitude: number
  noise: "random" | "perlin" | "wave"
}

export interface Light {
  type: "directional" | "point" | "spot" | "area"
  position?: Vec3
  direction?: Vec3
  intensity: number
  color: Color
  range?: number
  falloff?: number
  flicker?: FlickerBehavior
}

export type GlyphStyle =
  | "dense" | "light" | "round" | "angular"
  | "line" | "noise" | "block" | "symbolic"

export interface MotionBehavior {
  type: "flicker" | "flow" | "pulse" | "static"
  speed: number
}

export interface Material {
  baseColor: Color
  brightness: number          // 0–1
  emissive?: number
  roughness: number
  reflectivity: number
  transparency?: number
  glyphStyle?: GlyphStyle
  motionBehavior?: MotionBehavior
}

export interface Transform {
  position: Vec3
  rotation: Vec3
  scale: Vec3
}

export interface Sphere { type: "sphere"; radius: number }
export interface Box    { type: "box";    size: Vec3 }
export interface Plane  { type: "plane";  normal: Vec3 }
export interface Cylinder { type: "cylinder"; radius: number; height: number }
export interface SignedDistanceField {
  type: "sdf"
  functionName: string
  params: Record<string, number>
}

export type Geometry = Sphere | Box | Plane | Cylinder | SignedDistanceField

export interface Entity {
  id: string
  transform: Transform
  geometry: Geometry
  material: Material
  velocity?: Vec3
  angularVelocity?: Vec3
}

export interface Scene {
  time: number
  camera: Camera
  environment: Environment
  lights: Light[]
  entities: Entity[]
}

// Renderer internal types
export interface Ray {
  origin: Vec3
  direction: Vec3
}

export interface HitResult {
  hit: true
  position: Vec3
  normal: Vec3
  material: Material
  distance: number
}

export interface MissResult {
  hit: false
}

export type RaymarchResult = HitResult | MissResult

export interface GlyphCell {
  char: string
  r: number
  g: number
  b: number
  brightness: number
}
```

**Verify:** File compiles with `npx tsc --noEmit src/core/types.ts`.

---

## Step 3: Scene Loader

**Goal:** Load and validate a scene JSON file into the typed `Scene` interface.

**File:** `src/scene/SceneLoader.ts`

**Do this:**

1. Write a function `loadScene(filePath: string): Scene` that:
   - Reads the JSON file from disk with `fs.readFileSync`
   - Parses it with `JSON.parse`
   - Validates required fields exist: `camera`, `environment`, `lights`, `entities`
   - Validates each entity has `id`, `transform`, `geometry`, `material`
   - Sets defaults for optional fields: `time` defaults to `0`, missing `velocity` stays `undefined`
   - Throws descriptive errors for missing/invalid fields (e.g., `"Entity at index 2 is missing 'geometry'"`)
   - Returns the typed `Scene` object

2. Create a test scene file `scenes/test-sphere.json` using this content:
```json
{
  "time": 0,
  "camera": {
    "position": { "x": 0, "y": 2, "z": 6 },
    "rotation": { "x": 0, "y": 0, "z": 0 },
    "fov": 60,
    "near": 0.1,
    "far": 100
  },
  "environment": {
    "ambientLight": 0.2,
    "backgroundColor": { "r": 0, "g": 0, "b": 0 }
  },
  "lights": [
    {
      "type": "point",
      "position": { "x": 2, "y": 3, "z": 1 },
      "intensity": 3,
      "color": { "r": 255, "g": 180, "b": 80 }
    }
  ],
  "entities": [
    {
      "id": "sphere_1",
      "transform": {
        "position": { "x": 0, "y": 1, "z": 0 },
        "rotation": { "x": 0, "y": 0, "z": 0 },
        "scale": { "x": 1, "y": 1, "z": 1 }
      },
      "geometry": { "type": "sphere", "radius": 1 },
      "material": {
        "baseColor": { "r": 255, "g": 120, "b": 50 },
        "brightness": 1,
        "emissive": 0.5,
        "roughness": 0.5,
        "reflectivity": 0,
        "glyphStyle": "noise"
      }
    },
    {
      "id": "ground",
      "transform": {
        "position": { "x": 0, "y": 0, "z": 0 },
        "rotation": { "x": 0, "y": 0, "z": 0 },
        "scale": { "x": 1, "y": 1, "z": 1 }
      },
      "geometry": { "type": "plane", "normal": { "x": 0, "y": 1, "z": 0 } },
      "material": {
        "baseColor": { "r": 100, "g": 100, "b": 100 },
        "brightness": 0.5,
        "roughness": 0.3,
        "reflectivity": 0
      }
    }
  ]
}
```

3. Write a small test script `test/test-loader.ts`:
```ts
import { loadScene } from '../src/scene/SceneLoader'
const scene = loadScene('scenes/test-sphere.json')
console.log(`Loaded scene with ${scene.entities.length} entities`)
console.log(`Camera at: ${JSON.stringify(scene.camera.position)}`)
console.log(`First entity: ${scene.entities[0].id} (${scene.entities[0].geometry.type})`)
```

**Verify:** Run `npx ts-node test/test-loader.ts`. It should print:
```
Loaded scene with 2 entities
Camera at: {"x":0,"y":2,"z":6}
First entity: sphere_1 (sphere)
```

---

## Step 4: Frame Buffer (Structure-of-Arrays)

**Goal:** Pre-allocated, zero-allocation frame buffer for storing glyph data per pixel.

**File:** `src/renderer/FrameBuffer.ts`

**Do this:**

1. Create a class `FrameBuffer` that takes `width` and `height` in its constructor.
2. Allocate these flat typed arrays once, all sized to `width * height`:
   - `chars: Uint32Array` — Unicode code point of the glyph
   - `colorR: Uint8Array`
   - `colorG: Uint8Array`
   - `colorB: Uint8Array`
   - `brightness: Float32Array`
   - `dirty: Uint8Array` — 1 if this cell changed since last frame, 0 otherwise
3. Implement these methods:
   - `clear()` — Fill `chars` with space (0x20), colors with 0, brightness with 0, dirty with 1
   - `set(x, y, char, r, g, b, brightness)` — Write to position `y * width + x`. Mark dirty if value changed.
   - `get(x, y): GlyphCell` — Read from position, return a `GlyphCell` object
   - `isDirty(x, y): boolean`
   - `clearDirtyFlags()` — Set all dirty to 0
   - `resize(newWidth, newHeight)` — Reallocate all arrays

**Important:** The `set` method should compare the new value against the existing value before writing. Only set `dirty[idx] = 1` if the value actually changed. This is critical for the temporal reuse optimization later.

**Verify:** Write a test that creates a 10x10 FrameBuffer, sets a few cells, reads them back, checks dirty flags, clears dirty flags, and confirms they reset.

---

## Step 5: Presenter (Render to Screen)

**Goal:** Take the FrameBuffer and render it into the Electron window's `<pre>` element.

**File:** `src/renderer/Presenter.ts`

**Do this:**

1. Create a class `Presenter` that receives a reference to the `<pre>` DOM element.
2. Implement `present(frameBuffer: FrameBuffer)`:
   - Iterate the frame buffer row by row
   - Build an HTML string where each character is wrapped in a `<span>` with an inline `style="color: rgb(r,g,b)"` where r/g/b come from the frame buffer
   - Join rows with `\n`
   - Set the `<pre>` element's `innerHTML` to the result
3. **Optimization for later** (implement now but behind a flag): Only update spans for cells where `dirty === 1`. For now, always do a full rebuild.

**Important details:**
- Characters must be HTML-escaped: `&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`
- Use CSS on the `<pre>`: `font-family: monospace; font-size: 14px; line-height: 1.0; letter-spacing: 0;` to ensure characters form a tight grid
- Calculate display dimensions: `screenWidth` = characters that fit horizontally, `screenHeight` = rows that fit vertically, based on the window size and font metrics

**Verify:** Write a test that fills the frame buffer with random ASCII characters (code points 33–126) in random colors, calls `present()`, and confirms a colorful grid of characters appears in the Electron window.

---

## Step 6: Camera Ray Generation

**Goal:** Given a pixel coordinate, produce a ray from the camera into the scene.

**File:** `src/renderer/Camera.ts`

**Do this:**

1. Create a function `createRay(cam: Camera, x: number, y: number, screenWidth: number, screenHeight: number): Ray`
2. Implementation:
   ```
   aspectRatio = screenWidth / screenHeight
   
   // Convert pixel to normalized device coordinates (-1 to 1)
   ndcX = (2 * (x + 0.5) / screenWidth - 1) * aspectRatio * tan(fov/2 * PI/180)
   ndcY = (1 - 2 * (y + 0.5) / screenHeight) * tan(fov/2 * PI/180)
   
   // Ray direction in camera space
   dirLocal = normalize({ x: ndcX, y: ndcY, z: -1 })
   
   // Apply camera rotation (Euler angles, Y then X then Z)
   dirWorld = rotateByEuler(dirLocal, cam.rotation)
   
   return { origin: cam.position, direction: dirWorld }
   ```
3. You'll need these Vec3 utility functions — put them in `src/core/vec3.ts`:
   - `add(a, b): Vec3`
   - `sub(a, b): Vec3`
   - `mul(v, scalar): Vec3`
   - `dot(a, b): number`
   - `normalize(v): Vec3`
   - `length(v): number`
   - `cross(a, b): Vec3`
   - `rotateByEuler(v, rotation): Vec3` — applies rotation as Euler angles in radians (Y, X, Z order)

**Important:** The `aspectRatio` for ASCII rendering should account for the fact that monospace characters are typically taller than they are wide. Use an effective aspect ratio of `(screenWidth / screenHeight) * charAspectRatio` where `charAspectRatio ≈ 0.5` (a typical monospace character is about half as wide as it is tall). This prevents the rendered image from looking horizontally stretched. Expose `charAspectRatio` as a configurable constant.

**Verify:** For a camera at origin looking down -Z with 60° FOV: the center pixel should produce a ray pointing at `(0, 0, -1)`. A pixel at the top-left should point up-left-forward. Print rays for corners and center of a 40x20 screen and confirm they fan out correctly.

---

## Step 7: Signed Distance Functions

**Goal:** Implement SDF evaluators for each geometry type.

**File:** `src/renderer/sdf.ts`

**Do this:** Implement these pure functions. Each takes a point in the geometry's **local space** and returns the signed distance (negative = inside, positive = outside, zero = surface).

```ts
// Sphere centered at origin
function sdSphere(p: Vec3, radius: number): number {
  return length(p) - radius
}

// Axis-aligned box centered at origin
function sdBox(p: Vec3, size: Vec3): number {
  const d = { x: abs(p.x) - size.x/2, y: abs(p.y) - size.y/2, z: abs(p.z) - size.z/2 }
  const outside = length({ x: max(d.x,0), y: max(d.y,0), z: max(d.z,0) })
  const inside = min(max(d.x, max(d.y, d.z)), 0)
  return outside + inside
}

// Infinite plane through origin with given normal
function sdPlane(p: Vec3, normal: Vec3): number {
  return dot(p, normalize(normal))
}

// Cylinder along Y axis, centered at origin
function sdCylinder(p: Vec3, radius: number, height: number): number {
  const d2 = sqrt(p.x*p.x + p.z*p.z) - radius
  const d1 = abs(p.y) - height/2
  const outside = length({ x: max(d2,0), y: max(d1,0), z: 0 })
  const inside = min(max(d2, d1), 0)
  return outside + inside
}
```

Also implement a dispatcher:
```ts
function evaluateSDF(p: Vec3, geometry: Geometry): number {
  switch(geometry.type) {
    case "sphere":   return sdSphere(p, geometry.radius)
    case "box":      return sdBox(p, geometry.size)
    case "plane":    return sdPlane(p, geometry.normal)
    case "cylinder": return sdCylinder(p, geometry.radius, geometry.height)
    default:         return Infinity
  }
}
```

**Verify:** Unit test each function:
- `sdSphere({0,0,0}, 1)` → `-1` (inside)
- `sdSphere({1,0,0}, 1)` → `0` (on surface)
- `sdSphere({2,0,0}, 1)` → `1` (outside)
- `sdBox({0,0,0}, {2,2,2})` → `-1`
- `sdPlane({0,1,0}, {0,1,0})` → `1`

---

## Step 8: World Sampler

**Goal:** Given a point in world space, find the closest entity and return its distance + material.

**File:** `src/renderer/World.ts`

**Do this:**

1. Create a class `World` that takes the scene's `entities` array.
2. Implement `sample(point: Vec3): { distance: number, material: Material, entityId: string }`:
   ```
   for each entity:
     // Transform point from world space to entity's local space
     localPoint = worldToLocal(point, entity.transform)
     
     // Evaluate SDF in local space
     dist = evaluateSDF(localPoint, entity.geometry)
     
     // Account for uniform scale (multiply distance by scale magnitude)
     // For non-uniform scale, use min component as approximation
     scaleFactor = min(entity.transform.scale.x, entity.transform.scale.y, entity.transform.scale.z)
     dist *= scaleFactor
     
     // Track closest
     if dist < closestDist:
       closestDist = dist
       closestMaterial = entity.material
       closestId = entity.id
   
   return { distance: closestDist, material: closestMaterial, entityId: closestId }
   ```

3. Implement `worldToLocal(point: Vec3, transform: Transform): Vec3`:
   - Subtract `transform.position`
   - Apply inverse rotation (negate Euler angles, reverse order)
   - Divide by `transform.scale` (component-wise)

**Verify:** Place a sphere with radius 1 at position `(0, 1, 0)`. Sample at `(0, 1, 0)` → distance should be `-1`. Sample at `(0, 3, 0)` → distance should be `1`. Sample at `(0, 2, 0)` → distance should be `0`.

---

## Step 9: Raymarch Loop

**Goal:** March a ray through the scene and find the first surface hit.

**File:** `src/renderer/Raymarch.ts`

**Do this:**

1. Define constants at the top of the file:
   ```ts
   const MAX_STEPS = 64
   const HIT_THRESHOLD = 0.01
   const MAX_DISTANCE = 100.0
   const NORMAL_EPSILON = 0.001
   ```

2. Implement `raymarch(ray: Ray, world: World): RaymarchResult`:
   ```
   t = 0  (distance traveled along ray)
   
   for i = 0 to MAX_STEPS:
     pos = ray.origin + ray.direction * t
     
     sample = world.sample(pos)
     
     if sample.distance < HIT_THRESHOLD:
       normal = computeNormal(pos, world)
       return {
         hit: true,
         position: pos,
         normal: normal,
         material: sample.material,
         distance: t
       }
     
     t += sample.distance
     
     if t > MAX_DISTANCE:
       break
   
   return { hit: false }
   ```

3. Implement `computeNormal(pos: Vec3, world: World): Vec3`:
   ```
   eps = NORMAL_EPSILON
   
   nx = world.sample({pos.x + eps, pos.y, pos.z}).distance
      - world.sample({pos.x - eps, pos.y, pos.z}).distance
   ny = world.sample({pos.x, pos.y + eps, pos.z}).distance
      - world.sample({pos.x, pos.y - eps, pos.z}).distance
   nz = world.sample({pos.x, pos.y, pos.z + eps}).distance
      - world.sample({pos.x, pos.y, pos.z - eps}).distance
   
   return normalize({ x: nx, y: ny, z: nz })
   ```

**Verify:** Load the test scene. Fire a ray from `(0, 1, 6)` in direction `(0, 0, -1)` straight at the sphere at `(0, 1, 0)` with radius 1. Should hit at approximately `(0, 1, 1)` with normal `(0, 0, 1)` and distance ≈ 5.

---

## Step 10: Integration — First Visual Output

**Goal:** Wire everything together and render the test scene to the Electron window.

**File:** `src/renderer/RenderLoop.ts` (new) + update `src/main.ts`

**Do this:**

1. Create `renderFrame(scene: Scene, frameBuffer: FrameBuffer)`:
   ```
   world = new World(scene.entities)
   
   for y = 0 to frameBuffer.height:
     for x = 0 to frameBuffer.width:
       ray = createRay(scene.camera, x, y, frameBuffer.width, frameBuffer.height)
       result = raymarch(ray, world)
       
       if result.hit:
         // Simple brightness from normal: dot product with a fixed light direction
         lightDir = normalize({ x: 0.5, y: 1, z: 0.5 })
         brightness = max(0, dot(result.normal, lightDir))
         
         // Add ambient
         brightness = brightness * 0.8 + scene.environment.ambientLight
         brightness = clamp(brightness, 0, 1)
         
         // Map brightness to character ramp
         ramp = " .,:;=+*#%@"
         charIndex = floor(brightness * (ramp.length - 1))
         char = ramp[charIndex]
         
         // Color from material
         r = floor(result.material.baseColor.r * brightness)
         g = floor(result.material.baseColor.g * brightness)
         b = floor(result.material.baseColor.b * brightness)
         
         frameBuffer.set(x, y, char.codePointAt(0), r, g, b, brightness)
       else:
         // Background
         bg = scene.environment.backgroundColor
         frameBuffer.set(x, y, 0x20, bg.r, bg.g, bg.b, 0)
   ```

2. In `src/main.ts`:
   - On window load, determine screen dimensions (e.g., 120 columns × 40 rows)
   - Load the test scene
   - Create a FrameBuffer at that size
   - Call `renderFrame`
   - Call `presenter.present(frameBuffer)`
   - Log the time it took

3. Use `requestAnimationFrame` to render continuously (even though the scene is static for now, this validates the loop works).

**Verify:** You should see a recognizable sphere shape on screen made of ASCII characters, brighter on top and dimmer on the bottom/sides, with the ground plane visible beneath it. The sphere should be colored orange-ish (from the baseColor) and the ground gray. This is your first real visual milestone.

**Troubleshooting if it looks wrong:**
- If everything is black: check that brightness calculation isn't always 0. Print normals.
- If the sphere looks like a vertical oval: your char aspect ratio correction in Step 6 is missing or wrong. Try `charAspectRatio = 0.5`.
- If you see the sphere but no ground plane: the plane SDF may be returning wrong signs. A plane at y=0 with normal (0,1,0) should return negative for points below y=0.
- If the image is flipped: check that y=0 is the top row in your screen mapping.

---

## After Step 10

Once you have a sphere and ground plane rendering correctly with basic directional shading and color, you're ready for:

- **Steps 11–12:** Real lighting engine (point lights, multiple lights, emissive)
- **Steps 13–15:** SQLite glyph mapping (replace the character ramp with your database)
- **Steps 16–18:** Animation and the main game loop
- **Steps 19–22:** Performance optimizations
