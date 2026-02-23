# ASCII Renderer — Camera Controls Implementation

Adds first-person camera controls: WASD/arrow keys for movement, mouse capture for pitch/yaw.

---

## Step 1: Input State Tracker

**Goal:** Track which keys are currently held down. Don't move the camera inside key event handlers — just record state and let the update loop consume it.

**File:** `src/input/InputState.ts`

**Do this:**

1. Create a singleton class that tracks pressed keys and mouse delta:
   ```ts
   class InputState {
     // Movement keys (true = currently held)
     forward = false
     backward = false
     left = false
     right = false
     up = false      // Space
     down = false     // Shift

     // Mouse look delta (pixels moved since last frame)
     mouseDeltaX = 0
     mouseDeltaY = 0

     // Pointer lock state
     pointerLocked = false

     // Consume mouse delta (call once per frame, resets to 0)
     consumeMouseDelta(): { dx: number, dy: number } {
       const dx = this.mouseDeltaX
       const dy = this.mouseDeltaY
       this.mouseDeltaX = 0
       this.mouseDeltaY = 0
       return { dx, dy }
     }
   }
   ```

2. This class holds NO event listeners. It's pure state. Listeners are wired separately in Step 2.

**Verify:** Instantiate it, manually set `forward = true`, read it back. Trivial but confirms the module loads.

---

## Step 2: Keyboard Listener

**Goal:** Bind keyboard events to the InputState.

**File:** `src/input/KeyboardListener.ts`

**Do this:**

1. Create a class that takes an `InputState` and a target element (the Electron `window` or `document`):
   ```ts
   class KeyboardListener {
     private inputState: InputState

     constructor(inputState: InputState, target: EventTarget) {
       this.inputState = inputState
       target.addEventListener('keydown', this.onKeyDown.bind(this))
       target.addEventListener('keyup', this.onKeyUp.bind(this))
     }

     private onKeyDown(e: KeyboardEvent): void {
       this.updateKey(e.code, true)
       // Prevent default for game keys so the page doesn't scroll
       if (this.isGameKey(e.code)) e.preventDefault()
     }

     private onKeyUp(e: KeyboardEvent): void {
       this.updateKey(e.code, false)
     }

     private updateKey(code: string, pressed: boolean): void {
       switch (code) {
         case 'KeyW':
         case 'ArrowUp':
           this.inputState.forward = pressed; break
         case 'KeyS':
         case 'ArrowDown':
           this.inputState.backward = pressed; break
         case 'KeyA':
         case 'ArrowLeft':
           this.inputState.left = pressed; break
         case 'KeyD':
         case 'ArrowRight':
           this.inputState.right = pressed; break
         case 'Space':
           this.inputState.up = pressed; break
         case 'ShiftLeft':
         case 'ShiftRight':
           this.inputState.down = pressed; break
       }
     }

     private isGameKey(code: string): boolean {
       return ['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown',
               'ArrowLeft','ArrowRight','Space','ShiftLeft','ShiftRight'].includes(code)
     }

     destroy(): void {
       // Remove listeners — call on cleanup
     }
   }
   ```

2. Use `e.code` not `e.key` — `code` is layout-independent (physical key position), so WASD works on AZERTY keyboards in the physical WASD position. `e.key` would give you ZQSD on French keyboards.

**Verify:** Add a debug overlay or console log that prints the current InputState every 500ms. Press W — `forward` should be true. Release — false. Press W+D simultaneously — both true.

---

## Step 3: Mouse Look Listener with Pointer Lock

**Goal:** Capture the mouse so it doesn't hit screen edges, and track movement deltas for camera rotation.

**File:** `src/input/MouseListener.ts`

**Do this:**

1. Create a class that manages Pointer Lock and accumulates mouse deltas:
   ```ts
   class MouseListener {
     private inputState: InputState
     private canvas: HTMLElement  // the <pre> or container element

     constructor(inputState: InputState, canvas: HTMLElement) {
       this.inputState = inputState
       this.canvas = canvas

       // Click to capture
       canvas.addEventListener('click', this.requestLock.bind(this))

       // Pointer lock change events
       document.addEventListener('pointerlockchange', this.onLockChange.bind(this))
       document.addEventListener('pointerlockerror', this.onLockError.bind(this))

       // Mouse movement (only meaningful when locked)
       document.addEventListener('mousemove', this.onMouseMove.bind(this))
     }

     private requestLock(): void {
       this.canvas.requestPointerLock()
     }

     private onLockChange(): void {
       this.inputState.pointerLocked = (document.pointerLockElement === this.canvas)

       if (!this.inputState.pointerLocked) {
         // Reset deltas when unlocked to prevent jumps
         this.inputState.mouseDeltaX = 0
         this.inputState.mouseDeltaY = 0
       }
     }

     private onLockError(): void {
       console.warn('Pointer lock failed')
       this.inputState.pointerLocked = false
     }

     private onMouseMove(e: MouseEvent): void {
       if (!this.inputState.pointerLocked) return

       // Accumulate deltas — consumeMouseDelta() in the update loop resets these
       this.inputState.mouseDeltaX += e.movementX
       this.inputState.mouseDeltaY += e.movementY
     }

     // Call to release pointer lock (e.g., on Escape or pause)
     releaseLock(): void {
       document.exitPointerLock()
     }

     destroy(): void {
       // Remove all listeners
     }
   }
   ```

2. **Important Electron detail:** Pointer Lock works in Electron's BrowserWindow by default, but make sure the `<pre>` container or a wrapping `<div>` is the lock target — not the `<body>` element, which can behave inconsistently.

3. Add an Escape key handler to release pointer lock:
   ```ts
   // In KeyboardListener.onKeyDown:
   case 'Escape':
     document.exitPointerLock()
     break
   ```

4. Show a visual hint when the pointer is NOT locked (e.g., "Click to capture mouse" text centered on screen). Hide it when locked.

**Verify:** Click the render area — cursor should disappear (pointer lock). Move mouse — `mouseDeltaX/Y` should accumulate. Press Escape — cursor reappears, deltas stop accumulating. Click again — relocks.

---

## Step 4: Camera Controller

**Goal:** Consume input state each frame and update the scene camera accordingly.

**File:** `src/input/CameraController.ts`

**Do this:**

1. Create the controller:
   ```ts
   class CameraController {
     // Tuning constants
     moveSpeed = 5.0          // units per second
     lookSensitivity = 0.002  // radians per pixel of mouse movement
     pitchLimit = Math.PI / 2 - 0.01  // prevent gimbal lock at ±90°

     // Internal yaw/pitch state (radians)
     // Initialize from scene camera rotation on first use
     private yaw = 0     // rotation around Y axis (left/right)
     private pitch = 0   // rotation around X axis (up/down)
     private initialized = false

     update(camera: Camera, inputState: InputState, dt: number): void {
       // Initialize from camera's existing rotation on first frame
       if (!this.initialized) {
         this.yaw = camera.rotation.y
         this.pitch = camera.rotation.x
         this.initialized = true
       }

       // --- Mouse Look ---
       const { dx, dy } = inputState.consumeMouseDelta()

       if (inputState.pointerLocked) {
         this.yaw -= dx * this.lookSensitivity
         this.pitch -= dy * this.lookSensitivity

         // Clamp pitch to prevent flipping
         this.pitch = Math.max(-this.pitchLimit, Math.min(this.pitchLimit, this.pitch))
       }

       // Apply rotation to camera
       camera.rotation.x = this.pitch
       camera.rotation.y = this.yaw
       camera.rotation.z = 0  // no roll

       // --- WASD Movement ---
       // Build a movement vector in camera-local space
       let moveX = 0
       let moveZ = 0
       let moveY = 0

       if (inputState.forward)  moveZ -= 1
       if (inputState.backward) moveZ += 1
       if (inputState.left)     moveX -= 1
       if (inputState.right)    moveX += 1
       if (inputState.up)       moveY += 1
       if (inputState.down)     moveY -= 1

       // Skip if no input
       if (moveX === 0 && moveZ === 0 && moveY === 0) return

       // Normalize so diagonal movement isn't faster
       const len = Math.sqrt(moveX * moveX + moveZ * moveZ)
       if (len > 0) {
         moveX /= len
         moveZ /= len
       }

       // Transform movement from camera space to world space
       // Only yaw affects horizontal movement (pitch doesn't make you fly when walking forward)
       const sinYaw = Math.sin(this.yaw)
       const cosYaw = Math.cos(this.yaw)

       const worldX = moveX * cosYaw - moveZ * sinYaw
       const worldZ = moveX * sinYaw + moveZ * cosYaw

       // Apply movement
       const speed = this.moveSpeed * dt
       camera.position.x += worldX * speed
       camera.position.y += moveY * speed
       camera.position.z += worldZ * speed
     }

     // Call if you need to reset (e.g., loading a new scene)
     reset(camera: Camera): void {
       this.yaw = camera.rotation.y
       this.pitch = camera.rotation.x
       this.initialized = false
     }
   }
   ```

2. **Key design decisions explained:**

   - **Yaw/pitch stored internally, not read from `camera.rotation` each frame.** This prevents floating-point drift and ensures mouse look is always smooth. The camera rotation is treated as write-only from the controller's perspective after initialization.

   - **Movement is yaw-relative only.** When you press W, you move in the direction you're facing horizontally, even if you're looking up or down. This is standard FPS behavior. If you want flight-sim style (W moves in the direction you're looking including pitch), change the world-space transform to include pitch:
     ```
     // Flight mode alternative:
     forward = { -sinYaw * cosPitch, sinPitch, -cosYaw * cosPitch }
     ```

   - **Diagonal normalization** prevents moving ~1.4× faster when pressing W+D simultaneously.

   - **Pitch clamping** at ±89.9° prevents the camera from flipping upside down.

**Verify:** Load the test scene. Press W — camera moves toward the sphere. Press A — camera strafes left. Move mouse left — view rotates left (sphere moves right in view). Look straight up — pitch should stop just before vertical. Press W+D — movement speed should be the same as just W.

---

## Step 5: Wire Into the Render Loop

**Goal:** Connect all input components to the main loop.

**File:** Update `src/main.ts` and `src/renderer/RenderLoop.ts`

**Do this:**

1. In `src/main.ts` (or wherever you initialize the app), set up the input chain:
   ```ts
   // After creating the Electron window and <pre> element:

   const inputState = new InputState()
   const keyboardListener = new KeyboardListener(inputState, window)
   const mouseListener = new MouseListener(inputState, document.getElementById('display'))
   const cameraController = new CameraController()
   ```

2. In the `RenderLoop.tick()` method, add the camera update BEFORE rendering:
   ```ts
   private tick(): void {
     if (!this.running) return

     const frameStart = performance.now()
     const dt = this.updateTime()

     // Input → Camera (NEW)
     this.cameraController.update(this.scene.camera, this.inputState, dt)

     // Scene update
     updateLightFlicker(this.scene.lights, this.scene.time)
     updateScene(this.scene, dt)
     this.world.updateEntities(this.scene.entities)

     // Render
     this.renderFrame()

     // Present
     this.presenter.present(this.frameBuffer)

     // Timing
     const frameTime = performance.now() - frameStart
     this.recordFrameTime(frameTime)

     requestAnimationFrame(() => this.tick())
   }
   ```

3. **Important interaction with temporal reuse (Step 19):** If you've already implemented temporal reuse, camera movement must invalidate the temporal cache. The check in Step 19 already handles this:
   ```
   cameraMoved = distance(scene.camera.position, prevCameraPos) > 0.001
              || distance(scene.camera.rotation, prevCameraRot) > 0.001
   if cameraMoved: return false  // can't reuse, must re-raymarch
   ```
   But make sure this threshold is small enough that subtle mouse movements still trigger re-renders. `0.001` radians ≈ 0.06° which should be fine.

**Verify:** Full integration test. You should be able to:
- Walk around the scene with WASD
- Look around with the mouse
- Rise/fall with Space/Shift
- See the sphere from all angles
- Walk through the sphere (no collision — that's out of scope for now)
- The FPS counter should remain stable during movement

---

## Step 6: Sensitivity Settings and Sprint

**Goal:** Add configurable sensitivity, sprint modifier, and smooth acceleration.

**File:** Update `src/input/CameraController.ts`

**Do this:**

1. Add configurable speeds:
   ```ts
   // In CameraController:
   moveSpeed = 5.0
   sprintMultiplier = 2.5
   lookSensitivity = 0.002

   // In InputState, add:
   sprint = false  // Left Ctrl or double-tap W, etc.

   // In KeyboardListener, add:
   case 'ControlLeft':
     this.inputState.sprint = pressed; break
   ```

2. In the movement section of `update()`:
   ```ts
   const speed = this.moveSpeed * dt * (inputState.sprint ? this.sprintMultiplier : 1.0)
   ```

3. **Optional: smooth acceleration/deceleration.** Instead of instant start/stop, interpolate velocity:
   ```ts
   // Add to CameraController:
   private velocity: Vec3 = { x: 0, y: 0, z: 0 }
   private acceleration = 30.0  // units/sec² — how fast you reach move speed
   private friction = 10.0       // how fast you stop

   // Replace instant movement with:
   const targetVelX = worldX * this.moveSpeed * (inputState.sprint ? this.sprintMultiplier : 1)
   const targetVelZ = worldZ * this.moveSpeed * (inputState.sprint ? this.sprintMultiplier : 1)
   const targetVelY = moveY * this.moveSpeed * (inputState.sprint ? this.sprintMultiplier : 1)

   // Lerp toward target velocity
   const lerpFactor = 1 - Math.exp(-this.acceleration * dt)
   this.velocity.x = lerp(this.velocity.x, targetVelX, lerpFactor)
   this.velocity.y = lerp(this.velocity.y, targetVelY, lerpFactor)
   this.velocity.z = lerp(this.velocity.z, targetVelZ, lerpFactor)

   // Apply friction when no input
   if (moveX === 0 && moveZ === 0 && moveY === 0) {
     const frictionFactor = 1 - Math.exp(-this.friction * dt)
     this.velocity.x = lerp(this.velocity.x, 0, frictionFactor)
     this.velocity.y = lerp(this.velocity.y, 0, frictionFactor)
     this.velocity.z = lerp(this.velocity.z, 0, frictionFactor)
   }

   camera.position.x += this.velocity.x * dt
   camera.position.y += this.velocity.y * dt
   camera.position.z += this.velocity.z * dt
   ```
   Where `lerp(a, b, t) = a + (b - a) * t`.

   The exponential lerp (`1 - exp(-k * dt)`) is framerate-independent — it produces the same movement at 30 FPS and 120 FPS.

4. **Mouse smoothing (optional, some people prefer raw):**
   ```ts
   // Exponential smoothing on mouse delta
   private smoothDX = 0
   private smoothDY = 0
   private mouseSmoothFactor = 0.5  // 0 = no smoothing, 1 = very smooth

   // In update():
   this.smoothDX = lerp(dx, this.smoothDX, this.mouseSmoothFactor)
   this.smoothDY = lerp(dy, this.smoothDY, this.mouseSmoothFactor)
   this.yaw -= this.smoothDX * this.lookSensitivity
   this.pitch -= this.smoothDY * this.lookSensitivity
   ```
   Default this to OFF (factor = 0). Some users find smoothing adds perceived lag.

**Verify:** Hold Ctrl+W — should move noticeably faster. Release W — if smooth acceleration is on, camera should decelerate over ~0.1s rather than stopping instantly. Compare movement feel at 30 FPS vs 120 FPS — it should feel identical due to framerate-independent lerp.

---

## Step 7: HUD Overlay for Controls

**Goal:** Show control hints and current state to the user.

**File:** Update the Electron HTML or create `src/ui/HUD.ts`

**Do this:**

1. Add an overlay `<div>` positioned absolutely over the render `<pre>`:
   ```html
   <div id="hud" style="
     position: absolute;
     top: 0; left: 0; right: 0; bottom: 0;
     pointer-events: none;
     font-family: monospace;
     color: rgba(255, 255, 255, 0.7);
     font-size: 12px;
   ">
     <!-- Top-right: FPS counter -->
     <div id="hud-fps" style="position: absolute; top: 8px; right: 8px;"></div>

     <!-- Bottom-left: Camera position -->
     <div id="hud-camera" style="position: absolute; bottom: 8px; left: 8px;"></div>

     <!-- Center: Click to capture prompt (hidden when locked) -->
     <div id="hud-prompt" style="
       position: absolute; top: 50%; left: 50%;
       transform: translate(-50%, -50%);
       font-size: 16px;
       background: rgba(0,0,0,0.6);
       padding: 12px 24px;
       border-radius: 4px;
     ">Click to capture mouse · WASD to move · Esc to release</div>
   </div>
   ```

2. Update the HUD each frame:
   ```ts
   class HUD {
     update(fps: number, camera: Camera, pointerLocked: boolean): void {
       fpsEl.textContent = `${fps.toFixed(0)} FPS`

       cameraEl.textContent = `pos: ${camera.position.x.toFixed(1)}, ${camera.position.y.toFixed(1)}, ${camera.position.z.toFixed(1)} | ` +
                              `rot: ${(camera.rotation.x * 180/Math.PI).toFixed(0)}°, ${(camera.rotation.y * 180/Math.PI).toFixed(0)}°`

       promptEl.style.display = pointerLocked ? 'none' : 'block'
     }
   }
   ```

3. Set `pointer-events: none` on the HUD container so clicks pass through to the `<pre>` element for pointer lock.

**Verify:** On load, you see "Click to capture mouse" prompt. After clicking, it disappears and FPS + camera coordinates are visible. Pressing Escape brings the prompt back.

---

## File Summary

After completing all steps, you'll have these new files:

```
src/input/
├── InputState.ts          // Pure state: keys held, mouse deltas
├── KeyboardListener.ts    // DOM keydown/keyup → InputState
├── MouseListener.ts       // Pointer lock + mousemove → InputState
└── CameraController.ts    // Consumes InputState, updates Camera each frame

src/ui/
└── HUD.ts                 // FPS counter, camera coords, capture prompt
```

And these updated files:

```
src/renderer/RenderLoop.ts  // Added cameraController.update() call in tick()
src/main.ts                 // Wires up InputState, listeners, controller
index.html                  // Added HUD overlay div
```

---

## Common Pitfalls to Watch For

**Mouse feels inverted:** If yaw goes the wrong way, flip the sign on `dx` in the yaw calculation. Same for pitch with `dy`. Convention varies — test and adjust.

**Camera jumps on first mouse capture:** Make sure `consumeMouseDelta()` is called before the first render after pointer lock. Or zero out deltas in `onLockChange`. The spec above does this already but it's a common source of bugs.

**Movement speed feels different at different frame rates:** If you forgot to multiply by `dt`, movement will be faster at higher FPS. The framerate-independent lerp in Step 6 handles this, but double-check by artificially capping to 30 FPS and comparing.

**Arrow keys scroll the Electron window:** The `preventDefault()` on game keys in Step 2 prevents this. Make sure it's applied to both arrow keys and Space.

**Pointer lock doesn't work on first click in Electron:** Some Electron versions require the window to be focused first. Add `window.focus()` before `requestPointerLock()` if this happens.
