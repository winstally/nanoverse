export const SLIDE_W_CM = 12188825 / 360000 // 33.858… (PowerPoint slide width)

/**
 * Factory calibration of the maskless aligner: at 20× the projected 1 cm of
 * design equals 14 µm on the substrate. The µm-per-cm scale is inversely
 * proportional to the objective magnification, so their product is the optics'
 * native (1×) scale — an invariant that lets us rescale when the lens changes.
 */
export const DEFAULT_MAGNIFICATION = 20
export const DEFAULT_UM_PER_CM = 14

export interface Calibration {
  dmdW: number
  dmdH: number
  /** Objective magnification (e.g. 20×). */
  magnification: number
  /** Substrate µm per design-cm AT this magnification (the "1 cm = 14 µm" value). */
  umPerCm: number
  /** Physical field width (µm) = SLIDE_W_CM × umPerCm — the magnification anchor. */
  substrateWUm: number
  /** Physical field height (µm) — derived from the DMD aspect so pixels stay square. */
  substrateHUm: number
}

/** Horizontal layout pitch in µm/px for BMP rasterization. */
export function umPerPx(cal: Calibration): number {
  return cal.substrateWUm / cal.dmdW
}

export function umPerPxX(cal: Calibration): number {
  return cal.substrateWUm / cal.dmdW
}

export function umPerPxY(cal: Calibration): number {
  return cal.substrateHUm / cal.dmdH
}

/** Field height (µm) that keeps pixels square for the given DMD + width anchor. */
export function fieldHeightUm(cal: Calibration): number {
  return cal.dmdH * umPerPx(cal)
}

/** Substrate field width (µm) for a given µm-per-cm scale. */
export function substrateWidthUm(umPerCm: number): number {
  return SLIDE_W_CM * umPerCm
}

/**
 * The optics' native scale (µm per design-cm at 1×) — invariant across
 * objectives. Multiply by a magnification to get that lens's µm-per-cm.
 */
export function opticalConstant(
  cal: Pick<Calibration, 'umPerCm' | 'magnification'>,
): number {
  return cal.umPerCm * cal.magnification
}

export function defaultCalibration(): Calibration {
  const dmdW = 1920
  const dmdH = 1080
  const umPerCm = DEFAULT_UM_PER_CM
  const base = {
    dmdW,
    dmdH,
    magnification: DEFAULT_MAGNIFICATION,
    umPerCm,
    substrateWUm: substrateWidthUm(umPerCm),
    substrateHUm: 0,
  }
  return { ...base, substrateHUm: fieldHeightUm(base) }
}

export function umToPxX(cal: Calibration, uXum: number): number {
  return uXum / umPerPx(cal)
}
