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

/** Where the legend box sits inside the plot frame (or hidden). */
export type LegendPosition =
  | 'top-right'
  | 'top-left'
  | 'bottom-right'
  | 'bottom-left'
  | 'none'

/** Baseline correction applied to Y before normalize / fit / plot. */
export type BaselineMode = 'none' | 'min' | 'endpoints'

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
