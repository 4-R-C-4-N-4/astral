import Database from 'better-sqlite3'
import { GlyphStyle } from '../core/types'

export interface GlyphRecord {
  codePoint: number
  char: string
  // Raw features
  coverage: number
  roundness: number
  complexity: number
  symmetryH: number
  symmetryV: number
  connectedComponents: number
  aspectRatio: number
  strokeWidthMedian: number
  strokeWidthVariance: number
  endpointCount: number
  junctionCount: number
  eulerNumber: number
  // Normalized (0–1)
  normalizedCoverage: number
  normalizedComplexity: number
  normalizedConnectedComponents: number
}

export interface GlyphQueryParams {
  targetCoverage: number
  targetRoundness?: number
  targetComplexity?: number
  glyphStyle?: GlyphStyle
}

interface RawRow {
  codepoint: string
  char: string
  features: string
}

interface FeaturesJson {
  coverage: number
  roundness: number
  complexity: number
  symmetry: { horizontal: number; vertical: number }
  connectedComponents: number
  aspectRatio?: number
  strokeWidth?: { median: number; variance: number }
  endpointCount?: number
  junctionCount?: number
  eulerNumber?: number
}

function normalize(values: number[]): number[] {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min
  if (range === 0) return values.map(() => 0)
  return values.map(v => (v - min) / range)
}

export class GlyphDB {
  private glyphs: GlyphRecord[]

  constructor(dbPath: string) {
    const db = new Database(dbPath, { readonly: true })
    const rows = db.prepare('SELECT codepoint, char, features FROM glyphs').all() as RawRow[]
    db.close()

    // Parse raw rows
    const parsed: Omit<GlyphRecord, 'normalizedCoverage' | 'normalizedComplexity' | 'normalizedConnectedComponents'>[] = []
    for (const row of rows) {
      let f: FeaturesJson
      try {
        f = JSON.parse(row.features)
      } catch {
        continue
      }
      parsed.push({
        codePoint: parseInt(row.codepoint, 16),
        char: row.char,
        coverage: f.coverage ?? 0,
        roundness: f.roundness ?? 0,
        complexity: f.complexity ?? 0,
        symmetryH: f.symmetry?.horizontal ?? 0,
        symmetryV: f.symmetry?.vertical ?? 0,
        connectedComponents: f.connectedComponents ?? 1,
        aspectRatio: f.aspectRatio ?? 1,
        strokeWidthMedian: f.strokeWidth?.median ?? 0,
        strokeWidthVariance: f.strokeWidth?.variance ?? 0,
        endpointCount: f.endpointCount ?? 0,
        junctionCount: f.junctionCount ?? 0,
        eulerNumber: f.eulerNumber ?? 0,
      })
    }

    // Normalize coverage, complexity, connectedComponents
    const coverages = parsed.map(g => g.coverage)
    const complexities = parsed.map(g => g.complexity)
    const components = parsed.map(g => g.connectedComponents)

    const normCoverages = normalize(coverages)
    const normComplexities = normalize(complexities)
    const normComponents = normalize(components)

    this.glyphs = parsed.map((g, i) => ({
      ...g,
      normalizedCoverage: normCoverages[i],
      normalizedComplexity: normComplexities[i],
      normalizedConnectedComponents: normComponents[i],
    }))

    // Pre-sort by normalizedCoverage for binary search
    this.glyphs.sort((a, b) => a.normalizedCoverage - b.normalizedCoverage)
  }

  get allGlyphs(): GlyphRecord[] {
    return this.glyphs
  }

  queryBest(params: GlyphQueryParams): GlyphRecord {
    const { targetCoverage, targetRoundness, targetComplexity, glyphStyle } = params

    // Binary search to find the coverage window (±0.1)
    const lo = targetCoverage - 0.1
    const hi = targetCoverage + 0.1

    let left = 0
    let right = this.glyphs.length - 1
    while (left < right) {
      const mid = (left + right) >> 1
      if (this.glyphs[mid].normalizedCoverage < lo) {
        left = mid + 1
      } else {
        right = mid
      }
    }
    const startIdx = left

    let endIdx = startIdx
    while (endIdx < this.glyphs.length && this.glyphs[endIdx].normalizedCoverage <= hi) {
      endIdx++
    }

    // Score candidates in [startIdx, endIdx)
    // If window is empty, fall back to nearest
    const candidates = endIdx > startIdx
      ? this.glyphs.slice(startIdx, endIdx)
      : [this.glyphs[Math.min(Math.max(left, 0), this.glyphs.length - 1)]]

    let bestScore = Infinity
    let best = candidates[0]

    for (const glyph of candidates) {
      let score = 0

      // Coverage: primary driver (weight 4.0)
      score += 4.0 * Math.abs(glyph.normalizedCoverage - targetCoverage)

      // Roundness (weight 1.0)
      if (targetRoundness !== undefined) {
        score += 1.0 * Math.abs(glyph.roundness - targetRoundness)
      }

      // Complexity (weight 1.0)
      if (targetComplexity !== undefined) {
        score += 1.0 * Math.abs(glyph.normalizedComplexity - targetComplexity)
      }

      // GlyphStyle bias (weight 1.5)
      if (glyphStyle) {
        switch (glyphStyle) {
          case 'dense':    score += 1.5 * (1 - glyph.normalizedCoverage); break
          case 'light':    score += 1.5 * glyph.normalizedCoverage; break
          case 'round':    score += 1.5 * (1 - glyph.roundness); break
          case 'angular':  score += 1.5 * glyph.roundness; break
          case 'line':     score += 1.5 * glyph.normalizedConnectedComponents; break
          case 'noise':    score += 1.5 * (1 - glyph.normalizedComplexity); break
          case 'block':    score += 1.5 * (1 - glyph.symmetryH); break
          case 'symbolic': break // no bias
        }
      }

      if (score < bestScore) {
        bestScore = score
        best = glyph
      }
    }

    return best
  }
}
