import { describe, it, expect } from 'vitest'
import {
  peakCenter,
  computeStrainTable,
  DEFAULT_STRAIN_REFS,
  BULK_REF,
  type StrainSeries,
} from './strain'

// Synthetic spectrum on a 0.25 cm⁻¹ grid (280–530), Gaussian peaks placed
// exactly on grid points so peakCenter recovers them without bias.
function spectrum(peaks: { c: number; a: number }[]): { x: number[]; y: number[] } {
  const x: number[] = []
  const y: number[] = []
  const s = 3
  for (let i = 0; i <= 1000; i++) {
    const xi = 280 + i * 0.25
    let yi = 5
    for (const p of peaks) yi += p.a * Math.exp(-((xi - p.c) ** 2) / (2 * s * s))
    x.push(xi)
    y.push(yi)
  }
  return { x, y }
}

describe('peakCenter', () => {
  it('finds a peak within its window', () => {
    const { x, y } = spectrum([{ c: 300, a: 100 }])
    expect(peakCenter(x, y, 285, 312)).toBeCloseTo(300, 1)
  })
  it('returns null when no peak stands out', () => {
    const x = Array.from({ length: 200 }, (_, i) => 280 + i * 0.25)
    const y = x.map(() => 5) // flat
    expect(peakCenter(x, y, 285, 312)).toBeNull()
  })
  it('ignores a window with only a weak ripple (prominence guard)', () => {
    // big peak at 520, only 1% ripple in the Ge window → not a real Ge peak
    const { x, y } = spectrum([{ c: 520, a: 1000 }, { c: 300, a: 5 }])
    expect(peakCenter(x, y, 285, 312)).toBeNull()
  })
})

describe('computeStrainTable', () => {
  const ref: StrainSeries = {
    id: 'gos',
    name: 'gos',
    ...spectrum([{ c: 300, a: 100 }, { c: 520, a: 80 }]),
  }
  const bridge: StrainSeries = {
    id: 'gos25',
    name: 'gos25',
    ...spectrum([{ c: 299, a: 100 }, { c: 519.5, a: 80 }]),
  }

  it('relative to a reference sample: Δω → tensile strain', () => {
    const t = computeStrainTable([ref, bridge], 'gos', DEFAULT_STRAIN_REFS)
    const refRow = t.rows.find((r) => r.id === 'gos')!
    const row = t.rows.find((r) => r.id === 'gos25')!
    expect(refRow.isRef).toBe(true)
    expect(row.geDw).toBeCloseTo(-1, 1) // 299 − 300
    // ε = −Δω / 415 × 100 = +0.241 % (tensile)
    expect(row.geStrain).toBeCloseTo(0.241, 2)
    expect(row.siDw).toBeCloseTo(-0.5, 1)
    expect(row.siStrain).toBeCloseTo(0.07, 2)
  })

  it('reference row has zero shift against itself', () => {
    const t = computeStrainTable([ref, bridge], 'gos', DEFAULT_STRAIN_REFS)
    const refRow = t.rows.find((r) => r.id === 'gos')!
    expect(refRow.geDw).toBe(0)
    expect(refRow.geStrain).toBeCloseTo(0, 10)
  })

  it('relative to bulk reference values', () => {
    const t = computeStrainTable([ref], BULK_REF, DEFAULT_STRAIN_REFS)
    const row = t.rows[0]
    expect(row.geDw).toBeCloseTo(0, 1) // 300 vs bulk 300
    expect(row.siDw).toBeCloseTo(0, 1) // 520 vs bulk 520
  })

  it('blanks Si when the reference sample has no Si peak', () => {
    const geOnly: StrainSeries = {
      id: 'thickGe',
      name: 'thickGe',
      ...spectrum([{ c: 300, a: 1000 }]), // no Si peak
    }
    const t = computeStrainTable([geOnly, bridge], 'thickGe', DEFAULT_STRAIN_REFS)
    const row = t.rows.find((r) => r.id === 'gos25')!
    expect(row.geDw).not.toBeNull()
    expect(row.siStrain).toBeNull() // reference has no Si → no Si comparison
  })
})
