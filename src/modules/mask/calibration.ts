export const SLIDE_W_CM = 12188825 / 360000 // 33.858...
export const UM_PER_CM = 14 // "20x: 1cm = 14um"
export const SUBSTRATE_W_UM = SLIDE_W_CM * UM_PER_CM // ~474.0

export interface Calibration {
  dmdW: number
  dmdH: number
  /** Physical field width (µm) — the magnification anchor (X axis). */
  substrateWUm: number
  /** Physical field height (µm) — derived from the DMD aspect so pixels stay square. */
  substrateHUm: number
}

/**
 * Pixel pitch in µm/px. A maskless aligner projects the DMD through an objective
 * with uniform magnification, and the micromirrors are square, so one DMD pixel
 * maps to a physical *square*. There is a single pitch — it is isotropic by
 * construction; the field height follows from the DMD aspect ratio.
 */
export function umPerPx(cal: Calibration): number {
  return cal.substrateWUm / cal.dmdW
}

/** Field height (µm) that keeps pixels square for the given DMD + width anchor. */
export function fieldHeightUm(cal: Calibration): number {
  return cal.dmdH * umPerPx(cal)
}

export function defaultCalibration(): Calibration {
  const dmdW = 1920
  const dmdH = 1080
  const substrateWUm = SUBSTRATE_W_UM
  return {
    dmdW,
    dmdH,
    substrateWUm,
    substrateHUm: (substrateWUm / dmdW) * dmdH,
  }
}

export function umToPxX(cal: Calibration, uXum: number): number {
  return uXum / umPerPx(cal)
}

export function umToPxY(cal: Calibration, uYum: number): number {
  return uYum / umPerPx(cal)
}
