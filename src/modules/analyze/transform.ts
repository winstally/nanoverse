import { BaselineMode, MeasurementType } from './types'

export function nmToEv(nm: number): number {
  return 1239.84 / nm
}

export function evToNm(ev: number): number {
  return 1239.84 / ev
}

export function ramanShift(nmLaser: number, nm: number): number {
  return 1e7 * (1 / nmLaser - 1 / nm)
}

export function normalize(y: number[]): number[] {
  let max = -Infinity
  for (const v of y) {
    if (v > max) max = v
  }
  if (!Number.isFinite(max) || max === 0) return y.slice()
  return y.map((v) => v / max)
}

/**
 * Baseline correction.
 *  - 'none'      : pass-through copy
 *  - 'min'       : subtract the minimum finite value (flat offset removal)
 *  - 'endpoints' : subtract the straight line joining the first and last
 *                  finite points (linear drift removal)
 *
 * x is required for 'endpoints' so the line is interpolated against the real
 * abscissa; for the other modes it is ignored.
 */
export function baseline(
  y: number[],
  mode: BaselineMode,
  x?: number[],
): number[] {
  if (mode === 'none' || y.length === 0) return y.slice()

  if (mode === 'min') {
    let min = Infinity
    for (const v of y) if (Number.isFinite(v) && v < min) min = v
    if (!Number.isFinite(min)) return y.slice()
    return y.map((v) => (Number.isFinite(v) ? v - min : v))
  }

  // 'endpoints': subtract the chord between the first and last finite samples.
  let lo = -1
  let hi = -1
  for (let i = 0; i < y.length; i++) {
    if (Number.isFinite(y[i]) && (!x || Number.isFinite(x[i]))) {
      if (lo < 0) lo = i
      hi = i
    }
  }
  if (lo < 0 || hi <= lo) return y.slice()

  const xs = x ?? y.map((_, i) => i)
  const x0 = xs[lo]
  const x1 = xs[hi]
  const y0 = y[lo]
  const y1 = y[hi]
  const span = x1 - x0
  if (!Number.isFinite(span) || span === 0) {
    // Degenerate abscissa: fall back to subtracting the endpoint average.
    const base = (y0 + y1) / 2
    return y.map((v) => (Number.isFinite(v) ? v - base : v))
  }
  const slope = (y1 - y0) / span
  return y.map((v, i) => {
    if (!Number.isFinite(v)) return v
    const base = y0 + slope * (xs[i] - x0)
    return v - base
  })
}

export interface AxisInfo {
  x: number[]
  xLabel: string
  xUnit: string
}

export function transformX(
  x: number[],
  type: MeasurementType,
  opts: { xMode?: 'nm' | 'eV'; laserNm?: number; xIsWavelength?: boolean },
): AxisInfo {
  switch (type) {
    case 'PL': {
      if (opts.xMode === 'eV') {
        return { x: x.map(nmToEv), xLabel: 'Energy', xUnit: 'eV' }
      }
      return { x: x.slice(), xLabel: 'Wavelength', xUnit: 'nm' }
    }
    case 'Raman': {
      if (opts.xIsWavelength !== false) {
        const laserNm = opts.laserNm ?? 532
        return {
          x: x.map((nm) => ramanShift(laserNm, nm)),
          xLabel: 'Raman shift',
          xUnit: 'cm^-1',
        }
      }
      return { x: x.slice(), xLabel: 'Raman shift', xUnit: 'cm^-1' }
    }
    case 'XRD': {
      return { x: x.slice(), xLabel: '2θ', xUnit: 'deg' }
    }
  }
}
