import type { AxisMode, BaselineMode, LegendLayout, LegendPosition } from '../types'
import { DEFAULT_LEGEND } from '../types'

/**
 * Publication-plot style + persisted session display/measurement settings.
 *
 * The first block is the immutable Igor-style publication look (black on white,
 * Times New Roman, mirror frame). The remaining optional fields are the
 * frequently-changed session settings; they live here because the persisted
 * `AnalyzeSession` exposes exactly one flexible slot (`style`) and the storage
 * schema is shared foundation we don't own.
 */
export interface PlotStyle {
  mirror: boolean
  tickInward: boolean
  axisThickness: number
  fontFamily: string
  fontSize: number

  /** Where the legend sits, or hidden. (Legacy — superseded by `legend`.) */
  legendPosition?: LegendPosition
  /** Free-placed legend (position/size/visibility). */
  legend?: LegendLayout
  /** PL horizontal axis mode (nm / eV). */
  axisMode?: AxisMode
  /** Raman excitation wavelength (nm). */
  laserNm?: number
  /** Normalize each trace to its max. */
  normalize?: boolean
  /** Baseline correction applied before normalize / fit / plot. */
  baselineMode?: BaselineMode

  /** FP cavity length (µm). */
  fpL?: number
  /** FP peak-search minimum wavelength (nm). */
  fpMinWl?: number
  /** FP peak-search maximum wavelength (nm). */
  fpMaxWl?: number

  /** Editable formula constants (calibration). */
  hcEvNm?: number // E = hc / λ
  ramanK?: number // Δν = ramanK · (1/λ_L − 1/λ)
  fpAFactor?: number // A = fpAFactor · n_eff · L
}

export const IGOR_PRESET: PlotStyle = {
  mirror: true,
  tickInward: true,
  axisThickness: 2,
  fontFamily: 'Times New Roman',
  fontSize: 25,
}

/** Default session-level settings layered onto the Igor publication preset. */
export const DEFAULT_PLOT_STYLE: PlotStyle = {
  ...IGOR_PRESET,
  legendPosition: 'top-right',
  legend: { ...DEFAULT_LEGEND },
  axisMode: 'nm',
  laserNm: 532,
  normalize: false,
  baselineMode: 'none',
  fpL: 6,
  fpMinWl: 1160,
  fpMaxWl: 1580,
  hcEvNm: 1239.84,
  ramanK: 1e7,
  fpAFactor: 2000,
}
