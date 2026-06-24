import { describe, it, expect } from 'vitest'
import {
  SLIDE_W_CM,
  defaultCalibration,
  umPerPx,
  fieldHeightUm,
  substrateWidthUm,
  opticalConstant,
  umToPxX,
  DEFAULT_MAGNIFICATION,
  DEFAULT_UM_PER_CM,
} from './calibration'

describe('default calibration (20× · 1cm = 14µm)', () => {
  const cal = defaultCalibration()
  it('has the factory magnification and scale', () => {
    expect(cal.magnification).toBe(DEFAULT_MAGNIFICATION)
    expect(cal.umPerCm).toBe(DEFAULT_UM_PER_CM)
    expect(cal.dmdW).toBe(1920)
    expect(cal.dmdH).toBe(1080)
  })
  it('substrate width = slide width × µm/cm ≈ 474 µm', () => {
    expect(cal.substrateWUm).toBeCloseTo(SLIDE_W_CM * 14, 6)
    expect(cal.substrateWUm).toBeCloseTo(474.0, 1)
  })
  it('keeps pixels square (height follows the DMD aspect)', () => {
    expect(cal.substrateHUm).toBeCloseTo(cal.substrateWUm * (1080 / 1920), 6)
    expect(fieldHeightUm(cal)).toBeCloseTo(cal.substrateHUm, 6)
  })
})

describe('pixel pitch', () => {
  it('µm/px = substrate width / DMD width', () => {
    const cal = defaultCalibration()
    expect(umPerPx(cal)).toBeCloseTo(cal.substrateWUm / 1920, 9)
    expect(umToPxX(cal, umPerPx(cal))).toBeCloseTo(1, 9)
  })
})

describe('magnification ↔ µm/cm linkage', () => {
  it('the optics constant µm·×/cm is 14 × 20 = 280', () => {
    expect(opticalConstant({ umPerCm: 14, magnification: 20 })).toBe(280)
  })
  it('doubling magnification halves µm/cm at constant optics', () => {
    const c = opticalConstant({ umPerCm: 14, magnification: 20 })
    expect(c / 40).toBe(7) // 40× ⇒ 1cm = 7µm
    expect(substrateWidthUm(7)).toBeCloseTo(SLIDE_W_CM * 7, 6)
  })
})
