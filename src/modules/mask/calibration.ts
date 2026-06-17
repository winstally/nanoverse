export const SLIDE_W_CM = 12188825 / 360000 // 33.858...
export const SLIDE_H_CM = 7616825 / 360000 // 21.158...
export const UM_PER_CM = 14 // "20x: 1cm = 14um"
export const SUBSTRATE_W_UM = SLIDE_W_CM * UM_PER_CM // ~474.0
export const SUBSTRATE_H_UM = SLIDE_H_CM * UM_PER_CM // ~296.2

export interface Calibration {
  dmdW: number
  dmdH: number
  substrateWUm: number
  substrateHUm: number
  isotropic: boolean
}

export function defaultCalibration(): Calibration {
  return {
    dmdW: 1920,
    dmdH: 1080,
    substrateWUm: SUBSTRATE_W_UM,
    substrateHUm: SUBSTRATE_H_UM,
    isotropic: false,
  }
}

export function umPerPx(cal: Calibration): { x: number; y: number } {
  if (cal.isotropic) {
    const s = cal.substrateWUm / cal.dmdW
    return { x: s, y: s }
  }
  return {
    x: cal.substrateWUm / cal.dmdW,
    y: cal.substrateHUm / cal.dmdH,
  }
}

export function umToPxX(cal: Calibration, uXum: number): number {
  return uXum / umPerPx(cal).x
}

export function umToPxY(cal: Calibration, uYum: number): number {
  return uYum / umPerPx(cal).y
}
