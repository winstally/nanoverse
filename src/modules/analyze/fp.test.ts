import { describe, it, expect } from 'vitest'
import { fitFp, FP_A_FACTOR, DEFAULT_FP_OPTIONS } from './fp'

describe('FP_A_FACTOR', () => {
  it('is the fixed 2 (round-trip) × 1000 (µm→nm) constant', () => {
    expect(FP_A_FACTOR).toBe(2000)
  })
})

describe('fitFp on a synthetic comb', () => {
  // Build a perfect comb λ_m = A/m with A = FP_A_FACTOR·n_g·L, n_g=4, L=6.
  const ng = 4
  const L = 6
  const A = FP_A_FACTOR * ng * L // 48000
  const x: number[] = []
  const y: number[] = []
  for (let i = 0; i <= 1000; i++) {
    const xi = 1150 + i * 0.5 // 1150–1650 nm
    let yi = 10
    for (let m = 30; m <= 40; m++) {
      const lm = A / m
      yi += 1000 * Math.exp(-((xi - lm) ** 2) / (2 * 4 * 4))
    }
    x.push(xi)
    y.push(yi)
  }

  const res = fitFp(x, y, {
    ...DEFAULT_FP_OPTIONS,
    L,
    minWl: 1180,
    maxWl: 1620,
  })

  it('succeeds', () => {
    expect(res.ok).toBe(true)
  })

  it('recovers n_g,FP ≈ 4 and A ≈ 48000', () => {
    if (!res.ok) throw new Error(res.error)
    expect(res.fit.ngFp).toBeGreaterThan(3.8)
    expect(res.fit.ngFp).toBeLessThan(4.2)
    expect(res.fit.A).toBeCloseTo(A, -2) // within ~100 nm
  })

  it('detects most modes with a tight residual', () => {
    if (!res.ok) throw new Error(res.error)
    expect(res.fit.peaksNm.length).toBeGreaterThanOrEqual(8)
    expect(res.fit.rmseNm).toBeLessThan(2)
  })

  it('per-adjacent-pair n_g is ≈ n_g,FP for a continuous comb', () => {
    if (!res.ok) throw new Error(res.error)
    const finite = res.fit.pairNg.filter(Number.isFinite)
    expect(finite.length).toBeGreaterThan(0)
    for (const v of finite) expect(v).toBeCloseTo(ng, 0) // within ~0.5
  })
})
