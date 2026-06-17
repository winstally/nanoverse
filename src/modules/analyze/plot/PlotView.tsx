'use client'

import * as React from 'react'
import { scaleLinear, scaleLog } from 'd3-scale'
import type { LegendPosition, Trace } from '../types'
import { DEFAULT_LINE_WIDTH } from '../types'
import type { PlotStyle } from './preset'

export interface PlotOverlay {
  x: number[]
  y: number[]
  color?: string
}

export interface PlotViewProps {
  traces: Trace[]
  xLabel: string
  yLabel?: string
  style: PlotStyle
  xLog?: boolean
  yLog?: boolean
  /** Where the legend sits, or 'none' to hide it. Defaults to 'top-right'. */
  legendPosition?: LegendPosition
  width?: number
  height?: number
  /** Optional fit-curve drawn over the traces as a dashed line. */
  overlay?: PlotOverlay
}

// Muted fit-curve overlay fallback (ink-2). The publication plot's data/axes
// stay black-on-white; only this overlay line uses a quiet gray.
const OVERLAY_DEFAULT_COLOR = '#5b6470'

// Scientific-artifact colors: the publication plot is black ink on white paper.
const PAPER = '#ffffff'
const INK = '#000000'

const DEFAULT_WIDTH = 900
const DEFAULT_HEIGHT = 640

// How much room (in px) the ticks + labels need around the plotting area.
function computeMargins(style: PlotStyle) {
  const fs = style.fontSize
  return {
    top: Math.round(fs * 0.8),
    right: Math.round(fs * 0.8),
    bottom: Math.round(fs * 3.2),
    left: Math.round(fs * 4.0),
  }
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

function formatTick(v: number): string {
  if (v === 0) return '0'
  const abs = Math.abs(v)
  if (abs >= 1e5 || abs < 1e-3) {
    return v.toExponential(1)
  }
  // Trim trailing zeros, but only after a decimal point (never integer zeros).
  const fixed = v.toFixed(abs >= 100 ? 0 : abs >= 1 ? 2 : 3)
  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed
}

const PlotView = React.forwardRef<SVGSVGElement, PlotViewProps>(function PlotView(
  {
    traces,
    xLabel,
    yLabel = 'Intensity',
    style,
    xLog = false,
    yLog = false,
    legendPosition = 'top-right',
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
    overlay,
  },
  ref,
) {
  const visible = traces.filter((t) => t.visible && t.x.length > 0)
  const hasOverlay = !!overlay && overlay.x.length > 0 && overlay.y.length > 0
  const margins = computeMargins(style)
  const plotW = Math.max(10, width - margins.left - margins.right)
  const plotH = Math.max(10, height - margins.top - margins.bottom)

  // Gather all data extents from the visible traces.
  const allX: number[] = []
  const allY: number[] = []
  for (const t of visible) {
    for (const v of t.x) allX.push(v)
    for (const v of t.y) allY.push(v)
  }
  if (hasOverlay && overlay) {
    for (const v of overlay.x) allX.push(v)
    for (const v of overlay.y) allY.push(v)
  }

  const [xMin, xMax] = xLog ? positiveExtent(allX) : niceExtent(allX)
  const [yMin, yMax] = yLog ? positiveExtent(allY) : niceExtent(allY)

  const xScale = xLog
    ? scaleLog().domain([xMin, xMax]).range([0, plotW])
    : scaleLinear().domain([xMin, xMax]).nice().range([0, plotW])
  const yScale = yLog
    ? scaleLog().domain([yMin, yMax]).range([plotH, 0])
    : scaleLinear().domain([yMin, yMax]).nice().range([plotH, 0])

  const xTicks = xScale.ticks(6)
  const yTicks = yScale.ticks(6)

  const tickLen = Math.max(4, Math.round(style.fontSize * 0.35))
  const tickDir = style.tickInward ? -1 : 1 // inward = into the plotting area
  const labelGap = Math.round(style.fontSize * 0.45)

  // Build polyline points from x/y arrays, skipping non-finite / out-of-log-domain points.
  function buildPathXY(xs: number[], ys: number[]): string {
    const segs: string[] = []
    let penDown = false
    const n = Math.min(xs.length, ys.length)
    for (let i = 0; i < n; i++) {
      const xv = xs[i]
      const yv = ys[i]
      if (
        !Number.isFinite(xv) ||
        !Number.isFinite(yv) ||
        (xLog && xv <= 0) ||
        (yLog && yv <= 0)
      ) {
        penDown = false
        continue
      }
      const px = xScale(xv)
      const py = yScale(yv)
      if (!Number.isFinite(px) || !Number.isFinite(py)) {
        penDown = false
        continue
      }
      segs.push(`${penDown ? 'L' : 'M'}${px.toFixed(2)},${py.toFixed(2)}`)
      penDown = true
    }
    return segs.join(' ')
  }

  function buildPath(t: Trace): string {
    return buildPathXY(t.x, t.y)
  }

  // ── Legend geometry ──────────────────────────────────────────────────────
  const showLegend = legendPosition !== 'none' && visible.length > 0
  const legendNames = visible.map((t) => ({
    name: t.name,
    color: t.color,
    lineWidth: t.lineWidth ?? DEFAULT_LINE_WIDTH,
  }))
  const legendBoxW =
    legendNames.length > 0
      ? Math.max(
          ...legendNames.map((l) => l.name.length * style.fontSize * 0.52),
        ) +
        style.fontSize * 2.4
      : 0
  const legendLineH = style.fontSize * 1.35
  const legendBoxH = legendNames.length * legendLineH + style.fontSize * 0.6
  const legendPad = style.fontSize * 0.5
  const legendX =
    legendPosition === 'top-left' || legendPosition === 'bottom-left'
      ? legendPad
      : plotW - legendBoxW - legendPad
  const legendY =
    legendPosition === 'bottom-left' || legendPosition === 'bottom-right'
      ? plotH - legendBoxH - legendPad
      : legendPad

  return (
    <svg
      ref={ref}
      id="plot-svg"
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ fontFamily: style.fontFamily }}
    >
      {/* Outer canvas background */}
      <rect x={0} y={0} width={width} height={height} fill={PAPER} />

      <g transform={`translate(${margins.left},${margins.top})`}>
        {/* Plot area background */}
        <rect x={0} y={0} width={plotW} height={plotH} fill={PAPER} />

        {/* X ticks */}
        {xTicks.map((tv, i) => {
          const px = xScale(tv)
          if (!Number.isFinite(px)) return null
          return (
            <g key={`xt-${i}`}>
              <line
                x1={px}
                y1={plotH}
                x2={px}
                y2={plotH + tickDir * tickLen}
                stroke={INK}
                strokeWidth={style.axisThickness}
              />
              {style.mirror && (
                <line
                  x1={px}
                  y1={0}
                  x2={px}
                  y2={0 - tickDir * tickLen}
                  stroke={INK}
                  strokeWidth={style.axisThickness}
                />
              )}
              <text
                x={px}
                y={plotH + tickLen + labelGap}
                textAnchor="middle"
                dominantBaseline="hanging"
                fontSize={style.fontSize}
                fontFamily={style.fontFamily}
                fill={INK}
              >
                {formatTick(tv)}
              </text>
            </g>
          )
        })}

        {/* Y ticks */}
        {yTicks.map((tv, i) => {
          const py = yScale(tv)
          if (!Number.isFinite(py)) return null
          return (
            <g key={`yt-${i}`}>
              <line
                x1={0}
                y1={py}
                x2={0 - tickDir * tickLen}
                y2={py}
                stroke={INK}
                strokeWidth={style.axisThickness}
              />
              {style.mirror && (
                <line
                  x1={plotW}
                  y1={py}
                  x2={plotW + tickDir * tickLen}
                  y2={py}
                  stroke={INK}
                  strokeWidth={style.axisThickness}
                />
              )}
              <text
                x={0 - tickLen - labelGap}
                y={py}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={style.fontSize}
                fontFamily={style.fontFamily}
                fill={INK}
              >
                {formatTick(tv)}
              </text>
            </g>
          )
        })}

        {/* Axis frame */}
        {style.mirror ? (
          <rect
            x={0}
            y={0}
            width={plotW}
            height={plotH}
            fill="none"
            stroke={INK}
            strokeWidth={style.axisThickness}
          />
        ) : (
          <>
            <line
              x1={0}
              y1={plotH}
              x2={plotW}
              y2={plotH}
              stroke={INK}
              strokeWidth={style.axisThickness}
            />
            <line
              x1={0}
              y1={0}
              x2={0}
              y2={plotH}
              stroke={INK}
              strokeWidth={style.axisThickness}
            />
          </>
        )}

        {/* Traces (clipped to plot area) */}
        <clipPath id="plot-clip">
          <rect x={0} y={0} width={plotW} height={plotH} />
        </clipPath>
        <g clipPath="url(#plot-clip)">
          {visible.map((t) => (
            <path
              key={t.id}
              d={buildPath(t)}
              fill="none"
              stroke={t.color}
              strokeWidth={t.lineWidth ?? DEFAULT_LINE_WIDTH}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {hasOverlay && overlay && (
            <path
              d={buildPathXY(overlay.x, overlay.y)}
              fill="none"
              stroke={overlay.color ?? OVERLAY_DEFAULT_COLOR}
              strokeWidth={1.5}
              strokeDasharray="6 4"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}
        </g>

        {/* Legend */}
        {showLegend && (
          <g transform={`translate(${legendX},${legendY})`}>
            <rect
              x={0}
              y={0}
              width={legendBoxW}
              height={legendBoxH}
              fill={PAPER}
              stroke={INK}
              strokeWidth={1}
            />
            {legendNames.map((l, i) => {
              const cy = style.fontSize * 0.3 + legendLineH * (i + 0.5)
              return (
                <g key={`lg-${i}`}>
                  <line
                    x1={style.fontSize * 0.5}
                    y1={cy}
                    x2={style.fontSize * 1.8}
                    y2={cy}
                    stroke={l.color}
                    strokeWidth={l.lineWidth}
                  />
                  <text
                    x={style.fontSize * 2.1}
                    y={cy}
                    dominantBaseline="middle"
                    fontSize={style.fontSize}
                    fontFamily={style.fontFamily}
                    fill={INK}
                  >
                    {l.name}
                  </text>
                </g>
              )
            })}
          </g>
        )}
      </g>

      {/* X axis label */}
      <text
        x={margins.left + plotW / 2}
        y={height - Math.round(style.fontSize * 0.4)}
        textAnchor="middle"
        fontSize={style.fontSize}
        fontFamily={style.fontFamily}
        fill={INK}
      >
        {xLabel}
      </text>

      {/* Y axis label (rotated) */}
      <text
        x={Math.round(style.fontSize * 0.9)}
        y={margins.top + plotH / 2}
        textAnchor="middle"
        fontSize={style.fontSize}
        fontFamily={style.fontFamily}
        fill={INK}
        transform={`rotate(-90 ${Math.round(style.fontSize * 0.9)} ${margins.top + plotH / 2})`}
      >
        {yLabel}
      </text>
    </svg>
  )
})

export default PlotView
