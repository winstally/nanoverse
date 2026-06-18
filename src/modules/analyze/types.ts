export interface Trace {
  id: string
  name: string
  x: number[]
  y: number[]
  color: string
  visible: boolean
  /** Stroke width (px) for this trace in the publication plot. Default ~1.5. */
  lineWidth?: number
}

export type MeasurementType = 'PL' | 'Raman' | 'XRD'

/** PL-only horizontal axis mode. */
export type AxisMode = 'nm' | 'eV'

/** Baseline correction applied to Y before normalize / fit / plot. */
export type BaselineMode = 'none' | 'min' | 'endpoints'

/**
 * Free legend placement inside the (square) plot frame.
 * x/y are the top-left as a fraction (0–1) of the plot side; scale multiplies
 * the legend's font/box size. Persisted with the session.
 */
export interface LegendLayout {
  x: number
  y: number
  scale: number
  visible: boolean
}

export const DEFAULT_LEGEND: LegendLayout = {
  x: 0.62,
  y: 0.04,
  scale: 1,
  visible: true,
}

export const DEFAULT_LINE_WIDTH = 1.5

export const TRACE_COLORS: string[] = [
  '#378ADD',
  '#D85A30',
  '#1D9E75',
  '#7F77DD',
  '#D4537E',
  '#BA7517',
  '#2AA9B5',
  '#9B59B6',
  '#E0A800',
  '#5A6B7A',
]
