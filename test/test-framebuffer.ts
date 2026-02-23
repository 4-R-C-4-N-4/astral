import { FrameBuffer } from '../src/renderer/FrameBuffer'

const fb = new FrameBuffer(10, 10)

// After creation all cells should be dirty (clear() sets dirty=1)
console.assert(fb.isDirty(0, 0), 'Initial cell should be dirty')
console.assert(fb.isDirty(9, 9), 'Initial corner should be dirty')

// Clear dirty flags
fb.clearDirtyFlags()
console.assert(!fb.isDirty(0, 0), 'After clearDirtyFlags, cell should not be dirty')

// Set a cell and verify it reads back correctly
fb.set(3, 4, 65, 255, 128, 0, 0.75) // 'A' in orange
const cell = fb.get(3, 4)
console.assert(cell.char === 'A', `Expected 'A', got '${cell.char}'`)
console.assert(cell.r === 255, `Expected r=255, got ${cell.r}`)
console.assert(cell.g === 128, `Expected g=128, got ${cell.g}`)
console.assert(cell.b === 0, `Expected b=0, got ${cell.b}`)
console.assert(cell.brightness === 0.75, `Expected brightness=0.75, got ${cell.brightness}`)
console.assert(fb.isDirty(3, 4), 'Set cell should be dirty')

// Setting the same value again should not set dirty
fb.clearDirtyFlags()
fb.set(3, 4, 65, 255, 128, 0, 0.75)
console.assert(!fb.isDirty(3, 4), 'Same value re-set should NOT mark dirty')

// Resize test
fb.resize(5, 5)
console.assert(fb.width === 5 && fb.height === 5, 'Resize should update dimensions')
console.assert(fb.isDirty(0, 0), 'After resize, cells should be dirty')

console.log('All FrameBuffer tests passed.')
