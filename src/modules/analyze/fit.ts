import { gsd } from 'ml-gsd'
import { optimize } from 'ml-spectra-fitting'

export type PeakModel = 'gaussian' | 'lorentzian'

// Minimal local shape spec. ml-spectra-fitting types `shape` as `Shape1D` from
// ml-peak-shape-generator, which is a transitive (non-hoisted) dependency we
// cannot import by bare specifier. This subset (kind + fwhm) is structurally
// compatible with the gaussian/lorentzian variants we use.
type ShapeSpec = { kind: PeakModel; fwhm?: number }

export interface FitResult {
  center: number
  fwhm: number
  amplitude: number
  area: number
  model: PeakModel
}

const GAUSS_LN2_4 = 4 * Math.LN2

// Analytic area under one normalized peak shape of unit amplitude & given fwhm.
function shapeArea(model: PeakModel, amplitude: number, fwhm: number): number {
  if (!Number.isFinite(amplitude) || !Number.isFinite(fwhm) || fwhm <= 0) return 0
  if (model === 'gaussian') {
    // ∫ a*exp(-4ln2*((x-c)/fwhm)^2) dx = a * fwhm * sqrt(pi/(4 ln2))
    return amplitude * fwhm * Math.sqrt(Math.PI / GAUSS_LN2_4)
  }
  // lorentzian: ∫ a/(1+4*((x-c)/fwhm)^2) dx = a * fwhm * pi/2
  return amplitude * fwhm * (Math.PI / 2)
}

function evalShape(model: PeakModel, x: number, center: number, fwhm: number, amplitude: number): number {
  if (!Number.isFinite(fwhm) || fwhm <= 0) return 0
  const d = (x - center) / fwhm
  if (model === 'gaussian') {
    return amplitude * Math.exp(-GAUSS_LN2_4 * d * d)
  }
  return amplitude / (1 + 4 * d * d)
}

// If maxPeaks is omitted we cap detection to a small, sane default to avoid
// fitting an arm of noise spikes.
const DEFAULT_MAX_PEAKS = 6

export function fitPeaks(
  x: number[],
  y: number[],
  opts: { model: PeakModel; maxPeaks?: number },
): FitResult[] {
  if (x.length < 3 || y.length < 3) return []
  const model = opts.model
  const maxPeaks =
    opts.maxPeaks && opts.maxPeaks > 0 ? opts.maxPeaks : DEFAULT_MAX_PEAKS

  // --- Data extents --------------------------------------------------------
  let xLo = Infinity
  let xHi = -Infinity
  let yMax = -Infinity
  for (let i = 0; i < x.length; i++) {
    const xv = x[i]
    const yv = y[i]
    if (Number.isFinite(xv)) {
      if (xv < xLo) xLo = xv
      if (xv > xHi) xHi = xv
    }
    if (Number.isFinite(yv) && yv > yMax) yMax = yv
  }
  if (!Number.isFinite(xLo) || !Number.isFinite(xHi) || xHi <= xLo) return []
  if (!Number.isFinite(yMax) || yMax <= 0) return []

  const xRange = xHi - xLo
  // Median spacing → smallest physically meaningful fwhm.
  const dxMin = Math.max(estimateMinSpacing(x), xRange * 1e-4)
  const fwhmFloor = Math.max(dxMin, xRange * 1e-3)
  const fwhmCeil = xRange * 0.5
  // Fall back to a small fraction of the x-range when a detected width is junk.
  const widthFallback = Math.max(fwhmFloor, xRange * 0.02)

  // Subtract a flat baseline (min of y) so amplitudes are meaningful and the
  // fit doesn't try to absorb a DC offset into the peak shapes.
  let baseline = Infinity
  for (const v of y) if (Number.isFinite(v) && v < baseline) baseline = v
  if (!Number.isFinite(baseline)) baseline = 0
  const yShift = y.map((v) => (Number.isFinite(v) ? v - baseline : 0))
  const yPeakMax = yMax - baseline
  if (yPeakMax <= 0) return []

  // --- Detect candidate peaks ---------------------------------------------
  type Detected = { x: number; y: number; width: number }
  let detected: Detected[]
  try {
    detected = gsd(
      { x, y: yShift },
      {
        // Smooth the spectrum before picking so we don't lock onto noise.
        smoothY: true,
        sgOptions: { windowSize: 9, polynomial: 3 },
        // Raise the detection floor: ignore peaks below ~5% of the max.
        minMaxRatio: 0.05,
        realTopDetection: true,
      },
    ) as Detected[]
  } catch {
    return []
  }
  if (!detected || detected.length === 0) return []

  // Keep the strongest peaks first, then cap to maxPeaks.
  const peakList = detected
    .filter(
      (p) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.y > 0,
    )
    .sort((a, b) => b.y - a.y)
    .slice(0, maxPeaks)
  if (peakList.length === 0) return []

  // Per-peak amplitude ceiling (original scale). The optimizer normalizes y
  // internally, but our explicit min/max are given in original units.
  const ampMax = yPeakMax * 1.5

  // --- Optimize shape parameters against the (baseline-removed) data -------
  try {
    const result = optimize(
      { x, y: yShift },
      peakList.map((p) => {
        const w = Number.isFinite(p.width) && p.width > 0 ? p.width : widthFallback
        const initWidth = clamp(w, fwhmFloor, fwhmCeil)
        // The shape's fwhm drives the default fwhm init/min/max, so seed it
        // from the detected width instead of the library default (~500).
        const shape: ShapeSpec = { kind: model, fwhm: initWidth }
        return {
          x: p.x,
          y: p.y,
          shape,
          parameters: {
            x: {
              init: p.x,
              min: Math.max(xLo, p.x - initWidth * 2),
              max: Math.min(xHi, p.x + initWidth * 2),
            },
            y: {
              init: p.y,
              min: 0,
              max: ampMax,
            },
            fwhm: {
              init: initWidth,
              min: fwhmFloor,
              max: fwhmCeil,
            },
          },
        }
      }),
      { shape: { kind: model } satisfies ShapeSpec },
    )

    const fitted = result?.peaks ?? []
    const raw: FitResult[] = []
    for (const p of fitted) {
      const center = p.x
      const amplitude = p.y
      const fwhm = p.shape?.fwhm
      if (
        !Number.isFinite(center) ||
        !Number.isFinite(amplitude) ||
        !Number.isFinite(fwhm)
      ) {
        continue
      }
      raw.push({
        center,
        fwhm: fwhm as number,
        amplitude,
        area: shapeArea(model, amplitude, fwhm as number),
        model,
      })
    }
    if (raw.length === 0) return []

    // --- Post-filter junk peaks -------------------------------------------
    const ampPeak = raw.reduce((m, r) => Math.max(m, r.amplitude), 0)
    const ampFloor = ampPeak * 0.02
    const out = raw.filter(
      (r) =>
        Number.isFinite(r.center) &&
        Number.isFinite(r.fwhm) &&
        Number.isFinite(r.amplitude) &&
        r.fwhm > 0 &&
        r.fwhm <= xRange &&
        r.amplitude > ampFloor,
    )
    out.sort((a, b) => a.center - b.center)
    return out
  } catch {
    return []
  }
}

// Smallest gap between consecutive x values (assumes roughly sorted x).
function estimateMinSpacing(x: number[]): number {
  let min = Infinity
  for (let i = 1; i < x.length; i++) {
    const d = Math.abs(x[i] - x[i - 1])
    if (d > 0 && d < min) min = d
  }
  return Number.isFinite(min) ? min : 0
}

function clamp(v: number, lo: number, hi: number): number {
  if (hi < lo) return lo
  return Math.min(hi, Math.max(lo, v))
}

export function fitCurve(x: number[], results: FitResult[], model: PeakModel): number[] {
  return x.map((xi) => {
    let sum = 0
    for (const r of results) {
      sum += evalShape(model, xi, r.center, r.fwhm, r.amplitude)
    }
    return sum
  })
}
