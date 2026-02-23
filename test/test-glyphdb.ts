import * as path from 'path'
import { GlyphDB } from '../src/glyph/GlyphDB'
import { GlyphCache } from '../src/glyph/GlyphCache'

const dbPath = path.join(__dirname, '..', 'glyph_features.sqlite')

console.time('GlyphDB load')
const db = new GlyphDB(dbPath)
console.timeEnd('GlyphDB load')

console.log(`Loaded ${db.allGlyphs.length} glyph records`)

// Verify coverage range
const coverages = db.allGlyphs.map(g => g.normalizedCoverage)
const minCov = Math.min(...coverages)
const maxCov = Math.max(...coverages)
console.log(`Coverage range: ${minCov.toFixed(4)} – ${maxCov.toFixed(4)} (should be 0–1)`)

// Test queryBest
const sparse = db.queryBest({ targetCoverage: 0.0 })
console.log(`Coverage 0.0 → '${sparse.char}' (cov=${sparse.normalizedCoverage.toFixed(3)})`)

const dense = db.queryBest({ targetCoverage: 1.0 })
console.log(`Coverage 1.0 → '${dense.char}' (cov=${dense.normalizedCoverage.toFixed(3)})`)

const round = db.queryBest({ targetCoverage: 0.5, glyphStyle: 'round' })
console.log(`Coverage 0.5 round → '${round.char}' (roundness=${round.roundness.toFixed(3)})`)

const angular = db.queryBest({ targetCoverage: 0.5, glyphStyle: 'angular' })
console.log(`Coverage 0.5 angular → '${angular.char}' (roundness=${angular.roundness.toFixed(3)})`)

// Cache test
const cache = new GlyphCache(db)
const r1 = cache.select({ targetCoverage: 0.5 })
const r2 = cache.select({ targetCoverage: 0.5 })
console.assert(r1 === r2, 'Same params should return cached record (same reference)')
const stats = cache.stats()
console.log(`Cache stats: hits=${stats.hits} misses=${stats.misses} hitRate=${stats.hitRate.toFixed(1)}%`)
console.assert(stats.hits === 1, `Expected 1 hit, got ${stats.hits}`)
console.assert(stats.misses === 1, `Expected 1 miss, got ${stats.misses}`)

console.log('GlyphDB/GlyphCache tests passed.')
