import { describe, it, expect } from 'vitest'
import {
  nmToEv,
  evToNm,
  ramanShift,
  normalize,
  baseline,
  transformX,
  DEFAULT_HC_EV_NM,
} from './transform'

describe('nm ↔ eV', () => {
  it('E = hc/λ', () => {
    expect(nmToEv(DEFAULT_HC_EV_NM)).toBeCloseTo(1, 6)
    expect(nmToEv(620)).toBeCloseTo(2, 2)
  })
  it('round-trips', () => {
    expect(evToNm(nmToEv(1000))).toBeCloseTo(1000, 6)
  })
})

describe('ramanShift', () => {
  it('is zero at the laser line', () => {
    expect(ramanShift(532, 532)).toBeCloseTo(0, 6)
  })
  it('matches Δν = 1e7·(1/λL − 1/λ)', () => {
    expect(ramanShift(532, 560)).toBeCloseTo(939.85, 1)
  })
})

describe('normalize', () => {
  it('scales to the max', () => {
    expect(normalize([1, 2, 4])).toEqual([0.25, 0.5, 1])
  })
  it('leaves an all-zero trace unchanged', () => {
    expect(normalize([0, 0])).toEqual([0, 0])
  })
})

describe('baseline', () => {
  it('none copies', () => {
    const y = [3, 5, 4]
    const out = baseline(y, 'none')
    expect(out).toEqual(y)
    expect(out).not.toBe(y)
  })
  it('min subtracts the minimum', () => {
    expect(baseline([3, 5, 4], 'min')).toEqual([0, 2, 1])
  })
  it('endpoints subtracts the chord between first and last', () => {
    expect(baseline([1, 5, 3], 'endpoints', [0, 1, 2])).toEqual([0, 3, 0])
  })
})

describe('transformX', () => {
  it('PL nm passes through', () => {
    const r = transformX([1000, 1500], 'PL', { xMode: 'nm' })
    expect(r.x).toEqual([1000, 1500])
    expect(r.xUnit).toBe('nm')
  })
  it('PL eV converts', () => {
    const r = transformX([DEFAULT_HC_EV_NM], 'PL', { xMode: 'eV' })
    expect(r.x[0]).toBeCloseTo(1, 6)
    expect(r.xUnit).toBe('eV')
  })
  it('Raman cm⁻¹ data is plotted as-is (xIsWavelength=false)', () => {
    const r = transformX([300, 520], 'Raman', { xIsWavelength: false })
    expect(r.x).toEqual([300, 520])
    expect(r.xUnit).toBe('cm^-1')
  })
  it('Raman nm data is converted to shift (xIsWavelength=true)', () => {
    const r = transformX([560], 'Raman', {
      xIsWavelength: true,
      laserNm: 532,
      ramanK: 1e7,
    })
    expect(r.x[0]).toBeCloseTo(939.85, 1)
    expect(r.xUnit).toBe('cm^-1')
  })
  it('XRD passes through in degrees', () => {
    const r = transformX([28.4], 'XRD', {})
    expect(r.x).toEqual([28.4])
    expect(r.xUnit).toBe('deg')
  })
})
