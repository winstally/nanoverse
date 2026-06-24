import { scaleLinear } from 'd3-scale'
import type { Trace } from '../types'

export interface PlotDomainSeries {
  x: number[]
  y: number[]
}

export interface AxisDomain {
  domain: [number, number]
  manual: boolean
}

export interface PlotDomains {
  autoX: [number, number]
  autoY: [number, number]
  shownX: [number, number]
  shownY: [number, number]
  x: AxisDomain
  y: AxisDomain
  drawnX: [number, number]
  drawnY: [number, number]
}

function niceExtent(values: number[]): [number, number] {
  let min = Infinity
  let max = -Infinity
  for (const v of values) {
    if (!Number.isFinite(v)) continue
    if (v < min) min = v
    if (v > max) max = v
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1]
  if (min === max) {
    const pad = min === 0 ? 1 : Math.abs(min) * 0.1
    return [min - pad, max + pad]
  }
  return [min, max]
}

function positiveExtent(values: number[]): [number, number] {
  let min = Infinity
  let max = -Infinity
  for (const v of values) {
    if (!Number.isFinite(v) || v <= 0) continue
    if (v < min) min = v
    if (v > max) max = v
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [1, 10]
  if (min === max) return [min / 2, max * 2]
  return [min, max]
}

function resolveAxisDomain(
  auto: [number, number],
  lo: number | undefined,
  hi: number | undefined,
  log: boolean,
): AxisDomain {
  const okLo = Number.isFinite(lo) && (!log || (lo as number) > 0)
  const okHi = Number.isFinite(hi) && (!log || (hi as number) > 0)
  const manual = okLo || okHi
  const domain: [number, number] = [
    okLo ? (lo as number) : auto[0],
    okHi ? (hi as number) : auto[1],
  ]
  if (!(domain[0] < domain[1])) return { domain: auto, manual: false }
  return { domain, manual }
}

export function resolvePlotDomains({
  traces,
  overlays = [],
  xLog = false,
  yLog = false,
  xMin,
  xMax,
  yMin,
  yMax,
}: {
  traces: Pick<Trace, 'x' | 'y'>[]
  overlays?: PlotDomainSeries[]
  xLog?: boolean
  yLog?: boolean
  xMin?: number
  xMax?: number
  yMin?: number
  yMax?: number
}): PlotDomains {
  const allX: number[] = []
  const allY: number[] = []
  for (const t of traces) {
    for (const v of t.x) allX.push(v)
    for (const v of t.y) allY.push(v)
  }
  for (const overlay of overlays) {
    for (const v of overlay.x) allX.push(v)
    for (const v of overlay.y) allY.push(v)
  }

  const autoX = xLog ? positiveExtent(allX) : niceExtent(allX)
  const autoY = yLog ? positiveExtent(allY) : niceExtent(allY)
  const shownX = xLog
    ? autoX
    : (scaleLinear().domain(autoX).nice().domain() as [number, number])
  const shownY = yLog
    ? autoY
    : (scaleLinear().domain(autoY).nice().domain() as [number, number])
  const x = resolveAxisDomain(autoX, xMin, xMax, xLog)
  const y = resolveAxisDomain(autoY, yMin, yMax, yLog)

  return {
    autoX,
    autoY,
    shownX,
    shownY,
    x,
    y,
    drawnX: x.manual ? x.domain : shownX,
    drawnY: y.manual ? y.domain : shownY,
  }
}
