# ASCII Renderer — Implementation Steps 11–22

Continues from Steps 1–10. Each step assumes all prior steps are complete and working.

---

## Step 11: Lighting Engine

**Goal:** Replace the hardcoded directional light from Step 10 with a real lighting engine that evaluates all scene lights.

**File:** `src/renderer/Lighting.ts`

**Do this:**

1. Create a function `computeLighting(hitPos: Vec3, normal: Vec3, material: Material, scene: Scene): { brightness: number, r: number, g: number, b: number }`:

   ```
   totalR = 0, totalG = 0, totalB = 0

   for each light in scene.lights:
     contribution = 0

     if light.type === "point":
       toLight = sub(light.position, hitPos)
       dist = length(toLight)
       dir = normalize(toLight)

       // Lambert diffuse
       ndotl = max(0, dot(normal, dir))

       // Inverse square falloff
       attenuation = light.intensity / (dist * dist)

       // Range cutoff (if defined)
       if light.range and dist > light.range:
         attenuation = 0
       else if light.range:
         // Smooth falloff near range limit
         rangeFactor = 1 - (dist / light.range)^2
         attenuation *= max(0, rangeFactor)

       // Custom falloff exponent (if defined, default 2.0)
       if light.falloff:
         attenuation = light.intensity / (dist ^ light.falloff)

       contribution = ndotl * attenuation

     else if light.type === "directional":
       dir = normalize(negate(light.direction))  // light.direction points FROM light
       ndotl = max(0, dot(normal, dir))
       contribution = ndotl * light.intensity

     else if light.type === "spot":
       toLight = sub(light.position, hitPos)
       dist = length(toLight)
       dir = normalize(toLight)
       ndotl = max(0, dot(normal, dir))

       // Spot cone check
       spotAngle = dot(negate(dir), normalize(light.direction))
       // Assume 30° cone for now, expose as parameter later
       if spotAngle < cos(30 * PI / 180):
         contribution = 0
       else:
         contribution = ndotl * light.intensity / (dist * dist)

     // Accumulate light color contribution
     totalR += contribution * (light.color.r / 255)
     totalG += contribution * (light.color.g / 255)
     totalB += contribution * (light.color.b / 255)

   // Add ambient
   totalR += scene.environment.ambientLight
   totalG += scene.environment.ambientLight
   totalB += scene.environment.ambientLight

   // Multiply by material base color
   finalR = clamp(floor(totalR * material.baseColor.r), 0, 255)
   finalG = clamp(floor(totalG * material.baseColor.g), 0, 255)
   finalB = clamp(floor(totalB * material.baseColor.b), 0, 255)

   brightness = clamp((totalR + totalG + totalB) / 3, 0, 1)

   return { brightness, r: finalR, g: finalG, b: finalB }
   ```

2. Update `renderFrame` in `src/renderer/RenderLoop.ts` to call `computeLighting` instead of the hardcoded directional light from Step 10.

**Verify:** Load the test scene with the point light at `(2, 3, 1)`. The sphere should be brightest on the upper-right side (facing the light) and darkest on the lower-left. The light's warm color `(255, 180, 80)` should tint the sphere. Move the light position in the JSON and confirm the bright spot moves accordingly.

---

## Step 12: Emissive Materials

**Goal:** Materials with `emissive > 0` glow regardless of light positions.

**File:** Update `src/renderer/Lighting.ts`

**Do this:**

1. After computing lighting contribution, add emissive:
   ```
   if material.emissive and material.emissive > 0:
     emissiveContribution = material.emissive

     // Emissive adds directly to brightness and color
     totalR += emissiveContribution
     totalG += emissiveContribution
     totalB += emissiveContribution
   ```
   Add this BEFORE the final multiply by baseColor.

2. Emissive should make the material visible even with zero lights in the scene.

**Verify:** Create a test scene with NO lights and one sphere with `emissive: 1.0`. The sphere should be fully visible in its base color. Set `emissive: 0.5` and it should appear dimmer. Set `emissive: 0` and it should only be visible from ambient light.

---

## Step 13: Glyph Database Query Layer

**Goal:** Query your SQLite glyph database to find the best character for a given shading context.

**File:** `src/glyph/GlyphDB.ts`

**Do this:**

1. Create a class `GlyphDB` that opens the SQLite database in its constructor using `better-sqlite3`.

2. On initialization, load ALL glyphs into memory as an array of objects. The database is small enough (a few thousand characters) that this is faster than querying per-lookup:
   ```ts
   interface GlyphRecord {
     codePoint: number       // the Unicode code point
     char: string            // the actual character
     coverage: number        // 0–1
     roundness: number       // 0–1
     complexity: number      // raw value, will be normalized
     symmetryH: number       // 0–1
     symmetryV: number       // 0–1
     connectedComponents: number
     aspectRatio: number
     strokeWidthMedian: number
     strokeWidthVariance: number
     endpointCount: number
     junctionCount: number
     eulerNumber: number
   }
   ```

3. On load, normalize all parameters to 0–1 range:
   ```
   For each numeric field, find the min and max across all glyphs.
   Store normalized value: (value - min) / (max - min)
   Keep both raw and normalized values.
   ```

4. Implement `queryBest(params: GlyphQueryParams): GlyphRecord`:
   ```ts
   interface GlyphQueryParams {
     targetCoverage: number    // 0–1, derived from brightness
     targetRoundness?: number  // 0–1, from surface curvature
     targetComplexity?: number // 0–1, from material roughness
     glyphStyle?: GlyphStyle   // hint from material
   }
   ```

   Scoring function — lower score is better:
   ```
   score = 0

   // Coverage is the primary driver (weight: 4.0)
   score += 4.0 * abs(glyph.normalizedCoverage - params.targetCoverage)

   // Roundness (weight: 1.0)
   if params.targetRoundness is defined:
     score += 1.0 * abs(glyph.roundness - params.targetRoundness)

   // Complexity mapped from roughness (weight: 1.0)
   if params.targetComplexity is defined:
     score += 1.0 * abs(glyph.normalizedComplexity - params.targetComplexity)

   // GlyphStyle biases (weight: 1.5)
   if params.glyphStyle:
     switch glyphStyle:
       "dense":   score += 1.5 * (1 - glyph.normalizedCoverage)
       "light":   score += 1.5 * glyph.normalizedCoverage
       "round":   score += 1.5 * (1 - glyph.roundness)
       "angular": score += 1.5 * glyph.roundness
       "line":    score += 1.5 * glyph.normalizedConnectedComponents  // fewer = more line-like
       "noise":   score += 1.5 * (1 - glyph.normalizedComplexity)
       "block":   score += 1.5 * (1 - glyph.normalizedSymmetryH)
       "symbolic": no bias, let coverage dominate

   return glyph with lowest score
   ```

5. For performance, pre-sort the glyphs array by `normalizedCoverage`. When searching, binary-search to the target coverage, then only score glyphs within a ±0.1 coverage window. This reduces candidates from thousands to dozens.

**Verify:**
- Query with `targetCoverage: 0.0` → should return a very sparse character (like `.` or `,`)
- Query with `targetCoverage: 1.0` → should return a very dense character (like `@` or `█`)
- Query with `targetCoverage: 0.5, glyphStyle: "round"` → should prefer round characters like `O`, `o`, `0`
- Query with `targetCoverage: 0.5, glyphStyle: "angular"` → should prefer angular characters like `#`, `X`, `*`
- Log the top 5 candidates for each query to confirm scoring makes sense.

---

## Step 14: Glyph Selection Cache

**Goal:** Avoid repeated scoring by caching glyph lookups on quantized inputs.

**File:** `src/glyph/GlyphCache.ts`

**Do this:**

1. Create a class `GlyphCache` that wraps a `GlyphDB` instance.

2. Define quantization buckets:
   ```
   BRIGHTNESS_BUCKETS = 32    // coverage: 0–1 → 0–31
   ROUNDNESS_BUCKETS = 8      // 0–1 → 0–7
   COMPLEXITY_BUCKETS = 8     // 0–1 → 0–7
   STYLE_COUNT = 9            // 8 named styles + 1 for "none"
   ```

3. Build a cache key as a single integer:
   ```
   brightnessBucket = floor(targetCoverage * (BRIGHTNESS_BUCKETS - 1))
   roundnessBucket = floor((targetRoundness ?? 0.5) * (ROUNDNESS_BUCKETS - 1))
   complexityBucket = floor((targetComplexity ?? 0.5) * (COMPLEXITY_BUCKETS - 1))
   styleIndex = glyphStyleToIndex(glyphStyle)  // 0–8

   key = brightnessBucket
       + roundnessBucket * BRIGHTNESS_BUCKETS
       + complexityBucket * BRIGHTNESS_BUCKETS * ROUNDNESS_BUCKETS
       + styleIndex * BRIGHTNESS_BUCKETS * ROUNDNESS_BUCKETS * COMPLEXITY_BUCKETS
   ```

   Total possible keys: `32 * 8 * 8 * 9 = 18,432`. Small enough for a flat array.

4. Use a flat array, not a Map:
   ```ts
   const CACHE_SIZE = BRIGHTNESS_BUCKETS * ROUNDNESS_BUCKETS * COMPLEXITY_BUCKETS * STYLE_COUNT
   const cache: (GlyphRecord | null)[] = new Array(CACHE_SIZE).fill(null)
   ```

5. Implement `select(params: GlyphQueryParams): GlyphRecord`:
   ```
   key = buildKey(params)
   if cache[key] !== null:
     return cache[key]

   result = glyphDB.queryBest(params)
   cache[key] = result
   return result
   ```

6. Add a `clearCache()` method and a `stats()` method that returns `{ hits, misses, hitRate }`.

**Verify:** Render one full frame. Call `stats()`. After the first frame, hit rate should be >90%. On the second frame render (same scene, no changes), hit rate should be ~100%. Log it.

---

## Step 15: Integrate Glyph Mapper into Render Loop

**Goal:** Replace the character ramp from Step 10 with the real glyph selection system.

**File:** Update `src/renderer/RenderLoop.ts`

**Do this:**

1. Initialize `GlyphDB` and `GlyphCache` at startup (once, not per frame).

2. In `renderFrame`, after computing lighting for a hit pixel, replace the ramp lookup:
   ```
   // OLD:
   ramp = " .,:;=+*#%@"
   char = ramp[floor(brightness * (ramp.length - 1))]

   // NEW:
   queryParams = {
     targetCoverage: brightness,
     targetRoundness: computeRoundnessFromNormal(normal),
     targetComplexity: material.roughness,
     glyphStyle: material.glyphStyle
   }
   glyphRecord = glyphCache.select(queryParams)
   char = glyphRecord.char
   ```

3. Implement `computeRoundnessFromNormal(normal: Vec3): number`:
   ```
   // Surfaces facing the camera directly → rounder glyphs
   // Surfaces at grazing angles → more angular/line glyphs
   // Use the z-component of the normal (facing camera = high z)
   return abs(normal.z)
   ```
   This is a heuristic — surfaces you're looking at straight-on get round glyphs, edges get line-like glyphs.

4. Add a fallback: if the glyph database isn't available, fall back to the character ramp.

**Verify:** Render the test scene. Compare against the old ramp version:
- The sphere should now show varied characters, not just a brightness gradient
- Areas facing the camera should have rounder characters
- Edges and silhouettes should have more angular or line-like characters
- The ground plane should look different from the sphere (different roughness)
- Screenshot both versions for comparison

---

## Step 16: Scene Time and Entity Updates

**Goal:** Add a time system and update moving entities each frame.

**File:** `src/renderer/RenderLoop.ts` (update)

**Do this:**

1. Track time in the render loop:
   ```ts
   let lastFrameTime = performance.now()

   function updateTime(scene: Scene): number {
     const now = performance.now()
     const deltaMs = now - lastFrameTime
     lastFrameTime = now
     const deltaSec = deltaMs / 1000
     scene.time += deltaSec
     return deltaSec
   }
   ```

2. Implement `updateScene(scene: Scene, dt: number)`:
   ```
   for each entity in scene.entities:
     if entity.velocity:
       entity.transform.position.x += entity.velocity.x * dt
       entity.transform.position.y += entity.velocity.y * dt
       entity.transform.position.z += entity.velocity.z * dt

     if entity.angularVelocity:
       entity.transform.rotation.x += entity.angularVelocity.x * dt
       entity.transform.rotation.y += entity.angularVelocity.y * dt
       entity.transform.rotation.z += entity.angularVelocity.z * dt
   ```

3. Update the main loop structure:
   ```
   function mainLoop():
     dt = updateTime(scene)
     updateScene(scene, dt)
     renderFrame(scene, frameBuffer)
     presenter.present(frameBuffer)
     requestAnimationFrame(mainLoop)
   ```

**Verify:** Add `"velocity": { "x": 0.5, "y": 0, "z": 0 }` to the sphere in the test scene. The sphere should drift to the right over time. Add `"angularVelocity": { "x": 0, "y": 1, "z": 0 }` — for non-symmetric objects (like a box), you should see it rotate.

---

## Step 17: Flicker and Motion Behavior

**Goal:** Animate glyphs based on material motion behavior and light flicker.

**File:** Create `src/renderer/Animator.ts`

**Do this:**

1. Implement light flicker — update light intensities before rendering each frame:
   ```ts
   function updateLightFlicker(lights: Light[], time: number): void {
     for (const light of lights) {
       if (!light.flicker) continue

       const { speed, amplitude, noise } = light.flicker
       let flickerValue = 0

       switch (noise) {
         case "wave":
           flickerValue = Math.sin(time * speed) * amplitude
           break
         case "random":
           // Seeded pseudo-random per frame, not truly random (would jitter too much)
           flickerValue = (Math.sin(time * speed * 13.37) *
                          Math.sin(time * speed * 7.13)) * amplitude
           break
         case "perlin":
           // Simple 1D perlin approximation using layered sine waves
           flickerValue = (
             Math.sin(time * speed) * 0.5 +
             Math.sin(time * speed * 2.3 + 1.7) * 0.3 +
             Math.sin(time * speed * 4.7 + 3.1) * 0.2
           ) * amplitude
           break
       }

       // Store base intensity on first call, modulate from there
       if (light._baseIntensity === undefined) {
         light._baseIntensity = light.intensity
       }
       light.intensity = light._baseIntensity * (1 + flickerValue)
     }
   }
   ```
   Note: You'll need to extend the `Light` type with an optional `_baseIntensity` runtime field, or keep a separate Map for base values.

2. Implement glyph animation — after glyph selection, optionally modify the result:
   ```ts
   function animateGlyph(
     glyph: GlyphRecord,
     material: Material,
     time: number,
     glyphCache: GlyphCache
   ): GlyphRecord {
     if (!material.motionBehavior) return glyph

     const { type, speed } = material.motionBehavior

     switch (type) {
       case "static":
         return glyph

       case "pulse":
         // Modulate brightness sinusoidally
         const pulseFactor = 1 + Math.sin(time * speed) * 0.3
         const newCoverage = clamp(glyph.normalizedCoverage * pulseFactor, 0, 1)
         return glyphCache.select({
           ...originalParams,
           targetCoverage: newCoverage
         })

       case "flicker":
         // Randomly offset coverage to nearby glyph
         const offset = (Math.sin(time * speed * 17.3) *
                        Math.sin(time * speed * 11.1)) * 0.15
         const flickerCoverage = clamp(glyph.normalizedCoverage + offset, 0, 1)
         return glyphCache.select({
           ...originalParams,
           targetCoverage: flickerCoverage
         })

       case "flow":
         // Shift complexity target over time to create visual streaming
         const flowComplexity = (Math.sin(time * speed) + 1) / 2
         return glyphCache.select({
           ...originalParams,
           targetComplexity: flowComplexity
         })
     }
   }
   ```

3. Wire into the render loop:
   ```
   // Before renderFrame:
   updateLightFlicker(scene.lights, scene.time)

   // Inside renderFrame, after glyph selection:
   glyph = animateGlyph(glyph, material, scene.time + somePixelOffset, glyphCache)
   ```
   The `somePixelOffset` should be derived from the hit position (e.g., `dot(hitPos, {1,1,1})`) so that adjacent pixels don't all pulse in sync.

**Verify:**
- Add `"flicker": { "speed": 8, "amplitude": 0.2, "noise": "perlin" }` to the point light. The overall scene brightness should subtly fluctuate.
- Add `"motionBehavior": { "type": "pulse", "speed": 4 }` to the sphere material. The sphere's characters should visibly pulse brighter and dimmer.
- Add `"motionBehavior": { "type": "flicker", "speed": 10 }` — characters on the sphere should jitter/swap rapidly.

---

## Step 18: Main Loop with Timing and Frame Stats

**Goal:** Formalize the render loop with proper timing, frame rate measurement, and optional frame limiting.

**File:** Update `src/renderer/RenderLoop.ts`

**Do this:**

1. Implement the full main loop:
   ```ts
   class RenderLoop {
     private scene: Scene
     private frameBuffer: FrameBuffer
     private presenter: Presenter
     private glyphCache: GlyphCache
     private world: World

     private running = false
     private targetFPS = 120
     private frameCount = 0
     private fpsAccumulator = 0
     private lastFPSReport = 0
     private frameTimes: number[] = []  // rolling window of last 60 frame times

     start(): void {
       this.running = true
       this.lastFPSReport = performance.now()
       this.tick()
     }

     stop(): void {
       this.running = false
     }

     private tick(): void {
       if (!this.running) return

       const frameStart = performance.now()

       // Update
       const dt = this.updateTime()
       updateLightFlicker(this.scene.lights, this.scene.time)
       updateScene(this.scene, dt)
       this.world.updateEntities(this.scene.entities)  // refresh world sampler

       // Render
       this.renderFrame()

       // Present
       this.presenter.present(this.frameBuffer)

       // Timing
       const frameEnd = performance.now()
       const frameTime = frameEnd - frameStart
       this.recordFrameTime(frameTime)

       // Schedule next frame
       requestAnimationFrame(() => this.tick())
     }

     private recordFrameTime(ms: number): void {
       this.frameTimes.push(ms)
       if (this.frameTimes.length > 60) this.frameTimes.shift()
       this.frameCount++

       // Report FPS every second
       const now = performance.now()
       if (now - this.lastFPSReport >= 1000) {
         const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length
         const fps = 1000 / avg
         const worst = Math.max(...this.frameTimes)
         console.log(`FPS: ${fps.toFixed(1)} | avg: ${avg.toFixed(1)}ms | worst: ${worst.toFixed(1)}ms | cache: ${this.glyphCache.stats().hitRate.toFixed(1)}%`)
         this.lastFPSReport = now
       }
     }
   }
   ```

2. Display frame stats as an overlay in the top-right corner of the Electron window (a small `<div>` positioned absolute with the FPS counter).

**Verify:** Run the app. You should see FPS reported every second in the console and on-screen. With the test scene (1 sphere, 1 plane, 1 light) at ~120×40 resolution, you should be getting reasonable frame rates. Record this baseline — you'll compare against it after optimizations.

---

## Step 19: Temporal Reuse (Biggest Single Optimization)

**Goal:** Skip raymarching for pixels that haven't changed since the last frame.

**File:** Create `src/renderer/TemporalCache.ts`, update `RenderLoop.ts`

**Do this:**

1. Create a `TemporalCache` that stores per-pixel data from the previous frame:
   ```ts
   class TemporalCache {
     // Previous frame's depth buffer
     depth: Float32Array          // distance from camera to hit
     entityIds: Uint16Array       // which entity was hit (index into entity array)
     valid: Uint8Array            // 1 if this pixel can be reused

     // Camera state from previous frame
     prevCameraPos: Vec3
     prevCameraRot: Vec3

     width: number
     height: number
   }
   ```

2. At the end of each frame, store the depth and entity ID for every pixel.

3. At the start of the next frame, determine reusability:
   ```
   function canReuse(x, y, temporalCache, scene): boolean {
     if !temporalCache.valid[idx]: return false

     // Camera moved?
     cameraMoved = distance(scene.camera.position, temporalCache.prevCameraPos) > 0.001
                || distance(scene.camera.rotation, temporalCache.prevCameraRot) > 0.001
     if cameraMoved: return false

     // Entity at this pixel moved?
     entityIdx = temporalCache.entityIds[idx]
     if entityIdx is valid:
       entity = scene.entities[entityIdx]
       if entity.velocity or entity.angularVelocity:
         return false

     // Light changed? (flicker makes this always true if any light has flicker)
     if any light has flicker behavior:
       return false

     return true
   ```

4. In the render loop:
   ```
   for each pixel (x, y):
     if canReuse(x, y, temporalCache, scene):
       skip this pixel entirely (frame buffer already has the right value)
       continue

     // ... normal raymarch + lighting + glyph
   ```

5. **Important edge case:** If the frame buffer was resized, invalidate the entire temporal cache.

6. For scenes with flicker, this won't help much. Add a smarter version:
   ```
   // Even if light flickered, if the depth and entity are the same,
   // you can skip the raymarch and only recompute lighting + glyph
   if canReuseGeometry(x, y):
     // Reuse hit position and normal from previous frame
     // Only recompute lighting with new light intensities
     brightness = recomputeLighting(cachedHitPos, cachedNormal, cachedMaterial, scene)
     glyph = glyphCache.select(...)
   ```
   This means you store `hitPos`, `normal`, and `materialIndex` per pixel too. More memory, but skips the expensive raymarch.

**Verify:** Render a fully static scene (no velocity, no flicker). After the first frame, the render loop should report near-zero raymarch calls. FPS should jump dramatically. Then add a flickering light — raymarches should still be zero but lighting recalculations should happen. Then add a moving entity — only pixels near that entity should raymarch.

---

## Step 20: Uniform Spatial Grid

**Goal:** Avoid evaluating every entity's SDF for every sample point.

**File:** Create `src/renderer/SpatialGrid.ts`, update `World.ts`

**Do this:**

1. Define the grid:
   ```ts
   class SpatialGrid {
     cellSize: number                      // e.g., 2.0 world units
     cells: Map<number, number[]>          // hash → array of entity indices

     // Grid bounds (computed from scene)
     minBound: Vec3
     maxBound: Vec3
   }
   ```

2. Build the grid each frame:
   ```
   function buildGrid(entities: Entity[], cellSize: number): SpatialGrid {
     grid = new SpatialGrid(cellSize)

     for (i, entity) in entities:
       // Compute axis-aligned bounding box for entity
       aabb = computeAABB(entity)

       // Find all grid cells this AABB overlaps
       minCell = floor(aabb.min / cellSize)
       maxCell = floor(aabb.max / cellSize)

       for cx = minCell.x to maxCell.x:
         for cy = minCell.y to maxCell.y:
           for cz = minCell.z to maxCell.z:
             hash = hashCell(cx, cy, cz)
             grid.cells[hash].push(i)

     return grid
   }
   ```

3. Compute AABB per entity:
   ```
   function computeAABB(entity: Entity): { min: Vec3, max: Vec3 } {
     pos = entity.transform.position
     scale = entity.transform.scale

     switch entity.geometry.type:
       "sphere":
         r = geometry.radius * max(scale.x, scale.y, scale.z)
         return { min: sub(pos, {r,r,r}), max: add(pos, {r,r,r}) }
       "box":
         half = { x: geometry.size.x/2 * scale.x, ... }
         return { min: sub(pos, half), max: add(pos, half) }
       "plane":
         // Planes are infinite — return huge bounds
         // Or: add them to every cell (special case)
         return { min: {-1000,-1000,-1000}, max: {1000,1000,1000} }
       "cylinder":
         r = geometry.radius * max(scale.x, scale.z)
         h = geometry.height/2 * scale.y
         return { min: sub(pos, {r,h,r}), max: add(pos, {r,h,r}) }
   ```

4. Cell hash function (simple spatial hash):
   ```
   function hashCell(cx, cy, cz): number {
     return ((cx * 73856093) ^ (cy * 19349663) ^ (cz * 83492791)) & 0x7FFFFFFF
   }
   ```

5. Update `World.sample()` to use the grid:
   ```
   sample(point: Vec3): { distance, material, entityId } {
     cell = floor(point / cellSize)
     hash = hashCell(cell.x, cell.y, cell.z)
     candidates = grid.cells[hash] ?? []

     // Also check neighboring cells (the ray might be near a cell boundary)
     // Check the 3x3x3 neighborhood, or at minimum the cell the point is in
     // For simplicity, start with just the current cell + immediate neighbors

     closestDist = Infinity
     for idx of candidates:
       entity = entities[idx]
       dist = evaluateEntitySDF(point, entity)
       if dist < closestDist:
         closestDist = dist
         closestMaterial = entity.material
         closestId = entity.id

     return { distance: closestDist, material: closestMaterial, entityId: closestId }
   }
   ```

6. **Important:** Infinite planes must be handled specially. Either add them to every cell, or keep a separate `globalEntities` list that is always evaluated alongside the grid candidates.

**Verify:** Create a test scene with 50+ small spheres scattered around. Compare frame time with and without the spatial grid. The grid version should be significantly faster. Also verify correctness — the rendered image should be identical with and without the grid.

---

## Step 21: Tile-Based Parallel Rendering with Workers

**Goal:** Split the screen into tiles and render them in parallel across CPU cores.

**Files:** Create `src/renderer/TileRenderer.ts` and `src/renderer/RenderWorker.ts`

**Do this:**

1. Define tile structure:
   ```ts
   interface Tile {
     x: number      // top-left pixel x
     y: number      // top-left pixel y
     width: number   // tile width in pixels
     height: number  // tile height in pixels
   }

   const TILE_SIZE = 16

   function generateTiles(screenW: number, screenH: number): Tile[] {
     const tiles: Tile[] = []
     for (let y = 0; y < screenH; y += TILE_SIZE) {
       for (let x = 0; x < screenW; x += TILE_SIZE) {
         tiles.push({
           x, y,
           width: Math.min(TILE_SIZE, screenW - x),
           height: Math.min(TILE_SIZE, screenH - y)
         })
       }
     }
     return tiles
   }
   ```

2. Create a worker script `src/renderer/RenderWorker.ts`:
   ```ts
   // This runs in a worker_threads Worker
   import { parentPort, workerData } from 'worker_threads'

   // Receive scene data and rendering functions (or re-import them)
   // Workers need their own copies of: Scene, World, Camera, Raymarch, Lighting, GlyphCache

   parentPort.on('message', (msg) => {
     if (msg.type === 'render_tile') {
       const { tile, sceneData } = msg
       const results = renderTile(tile, sceneData)
       parentPort.postMessage({ type: 'tile_result', tile, results })
     }
   })

   function renderTile(tile: Tile, sceneData: Scene): TileResult {
     // Create local World, etc. from scene data
     // Raymarch only pixels in this tile's range
     // Return array of GlyphCell results

     const cells: GlyphCell[] = []
     for (let y = tile.y; y < tile.y + tile.height; y++) {
       for (let x = tile.x; x < tile.x + tile.width; x++) {
         // ... same raymarch + lighting + glyph logic as main renderer
         cells.push(result)
       }
     }
     return { cells }
   }
   ```

3. Create `TileRenderer` that manages the worker pool:
   ```ts
   import { Worker } from 'worker_threads'
   import os from 'os'

   class TileRenderer {
     private workers: Worker[]
     private workerCount: number

     constructor() {
       this.workerCount = Math.max(1, os.cpus().length - 1)  // leave 1 core for main thread
       this.workers = []
       for (let i = 0; i < this.workerCount; i++) {
         this.workers.push(new Worker('./dist/renderer/RenderWorker.js'))
       }
     }

     async renderFrame(scene: Scene, frameBuffer: FrameBuffer): Promise<void> {
       const tiles = generateTiles(frameBuffer.width, frameBuffer.height)

       // Serialize scene data once (SharedArrayBuffer if possible, JSON otherwise)
       const sceneData = serializeScene(scene)

       // Distribute tiles round-robin to workers
       const promises: Promise<void>[] = []
       for (let i = 0; i < tiles.length; i++) {
         const worker = this.workers[i % this.workerCount]
         promises.push(this.renderTileOnWorker(worker, tiles[i], sceneData, frameBuffer))
       }

       await Promise.all(promises)
     }

     private renderTileOnWorker(worker, tile, sceneData, frameBuffer): Promise<void> {
       return new Promise(resolve => {
         worker.postMessage({ type: 'render_tile', tile, sceneData })
         worker.once('message', (msg) => {
           // Write tile results back into frame buffer
           this.writeTileToBuffer(msg.tile, msg.results, frameBuffer)
           resolve()
         })
       })
     }
   }
   ```

4. **Key decision — data transfer:** Passing scene data and results between threads has overhead. Two approaches:
   - **Simple (start here):** JSON serialize scene, send tile results as typed arrays via `postMessage` (uses structured clone)
   - **Advanced (later):** Use `SharedArrayBuffer` for the frame buffer so workers write directly into it without message passing. Requires `Cross-Origin-Isolation` headers in Electron.

5. Update `RenderLoop` to use `TileRenderer` instead of the single-threaded `renderFrame`.

**Verify:** Compare frame times between single-threaded and tiled rendering. On a 4+ core machine you should see 2–4× speedup (not linear due to overhead). Verify the rendered image is identical — no tile boundary artifacts, no missing pixels.

---

## Step 22: Adaptive Quality

**Goal:** Reduce work for less-important pixels to hit frame time targets.

**File:** Create `src/renderer/AdaptiveQuality.ts`, update `Raymarch.ts`

**Do this:**

1. **Per-pixel step count based on screen position:**
   ```ts
   function getMaxSteps(x: number, y: number, screenW: number, screenH: number): number {
     // Normalized distance from screen center (0 = center, 1 = corner)
     const cx = (x / screenW - 0.5) * 2
     const cy = (y / screenH - 0.5) * 2
     const distFromCenter = Math.sqrt(cx * cx + cy * cy) / Math.SQRT2  // 0–1

     // Center: full 64 steps. Edges: 24 steps minimum.
     const minSteps = 24
     const maxSteps = 64
     return Math.floor(maxSteps - distFromCenter * (maxSteps - minSteps))
   }
   ```
   Pass this into the `raymarch` function as the step limit.

2. **Dynamic resolution scaling:**
   ```ts
   class AdaptiveQuality {
     private targetFrameTime = 8.33  // 120 FPS
     private currentScale = 1.0
     private minScale = 0.5
     private maxScale = 1.0

     adjust(lastFrameTime: number): number {
       if (lastFrameTime > this.targetFrameTime * 1.2) {
         // Too slow — reduce resolution
         this.currentScale = Math.max(this.minScale, this.currentScale - 0.05)
       } else if (lastFrameTime < this.targetFrameTime * 0.8) {
         // Fast enough — increase resolution
         this.currentScale = Math.min(this.maxScale, this.currentScale + 0.02)
       }
       return this.currentScale
     }
   }
   ```

   When scale < 1.0, render at reduced resolution and duplicate pixels:
   ```
   renderWidth = floor(screenWidth * scale)
   renderHeight = floor(screenHeight * scale)

   // Render at reduced size
   renderFrame(scene, smallBuffer)

   // Upscale: nearest-neighbor copy into full buffer
   for y in screenHeight:
     for x in screenWidth:
       srcX = floor(x * scale)
       srcY = floor(y * scale)
       frameBuffer.set(x, y, smallBuffer.get(srcX, srcY))
   ```

   ASCII is forgiving here — the visual difference between 100% and 70% resolution in ASCII art is minimal.

3. **Column skipping (ASCII-specific optimization):**
   Since characters are wider than they are tall perceptually, you can render every other column and duplicate:
   ```
   for y = 0 to height:
     for x = 0 to width, step 2:
       result = raymarchAndShade(x, y)
       frameBuffer.set(x, y, result)
       frameBuffer.set(x + 1, y, result)  // duplicate to neighbor
   ```
   This halves raymarch work with minimal visual impact. Gate it behind a quality flag.

4. **Frame time budget enforcement:**
   ```
   // If a frame exceeds budget, abort remaining tiles and reuse previous frame data
   // This prevents stutter — better to show a slightly stale frame than to stall
   const FRAME_DEADLINE_MS = 12  // hard deadline

   if (performance.now() - frameStart > FRAME_DEADLINE_MS) {
     // Stop processing, present what we have
     // Mark unfinished pixels as not-dirty so they get picked up next frame
     break
   }
   ```

**Verify:**
- Enable adaptive quality. Set target to 120 FPS. Add enough entities to the scene that the renderer drops below 120 FPS at full resolution. The system should automatically reduce resolution to maintain the target. Log the current scale factor alongside FPS.
- Test the step count reduction: render the same scene at full steps vs. adaptive steps. Edge pixels may have minor artifacts (missed thin objects) but the center should be identical. For most ASCII scenes this is unnoticeable.
- Test column skipping: compare full render vs. skip mode. The visual difference should be minimal.

---

## Implementation Priority Summary

| Priority | Steps | What You Get |
|----------|-------|-------------|
| **Critical** | 11–12 | Real lighting — scene looks correct |
| **Critical** | 13–15 | Glyph database integration — the whole point of the project |
| **Important** | 16–18 | Animation — scenes come alive |
| **Optimize** | 19 | Temporal reuse — biggest single perf win, easy to implement |
| **Optimize** | 20 | Spatial grid — needed for scenes with many entities |
| **Optimize** | 21 | Worker threads — needed for high resolution or complex scenes |
| **Optimize** | 22 | Adaptive quality — polish, keeps frame rate stable |

Do Steps 11–15 first. That gets you the complete visual pipeline. Then 16–18 for animation. Then optimize in order of impact: 19 → 20 → 21 → 22.
