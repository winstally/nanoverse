'use client'

import * as React from 'react'
import { scaleLinear, scaleLog } from 'd3-scale'
import type { LegendLayout, Trace } from '../types'
import { DEFAULT_LEGEND, DEFAULT_LINE_WIDTH } from '../types'
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
  /** Free-placed legend. */
  legend?: LegendLayout
  /** Called while the user drags / resizes the legend. */
  onLegendChange?: (legend: LegendLayout) => void
  width?: number
  height?: number
  /** Optional fit-curve drawn over the traces as a dashed line. */
  overlay?: PlotOverlay
  /**
   * Optional vertical marker lines (e.g. FP fitted peak wavelengths). Positions
   * are in the CURRENT plot X coordinate space (same units as the trace X after
   * any axis transform). Each is drawn full plot-height, clipped to the plot
   * area, at strokeWidth 2.
   */
  verticalLines?: number[]
  /** Legend label for the vertical marker lines (e.g. "FP共振"). */
  verticalLineLabel?: string
}

// Muted fit-curve overlay fallback (ink-2). The publication plot's data/axes
// stay black-on-white; only this overlay line uses a quiet gray.
const OVERLAY_DEFAULT_COLOR = '#5b6470'

// Scientific-artifact colors: the publication plot is black ink on white paper.
const PAPER = '#ffffff'
const INK = '#000000'
const ACCENT = '#2f6df0' // legend drag affordance (chrome, stripped from export)
// Vertical marker lines (FP peak positions): green.
const MARKER = '#16a34a'

// The overall SVG box; the data area inside is forced SQUARE.
const DEFAULT_WIDTH = 760
const DEFAULT_HEIGHT = 760

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

// How much room (in px) the ticks + labels need around the plotting area.
function computeMargins(style: PlotStyle) {
  const fs = style.fontSize
  return {
    top: Math.round(fs * 0.8),
    // Wide enough to fit half of the last x-axis tick label (centred on the
    // right frame edge), so e.g. "1600" isn't clipped.
    right: Math.round(fs * 1.8),
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
    legend = DEFAULT_LEGEND,
    onLegendChange,
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
    overlay,
    verticalLines,
    verticalLineLabel,
  },
  ref,
) {
  const innerRef = React.useRef<SVGSVGElement | null>(null)
  const setSvg = React.useCallback(
    (el: SVGSVGElement | null) => {
      innerRef.current = el
      if (typeof ref === 'function') ref(el)
      else if (ref) (ref as React.MutableRefObject<SVGSVGElement | null>).current = el
    },
    [ref],
  )

  const visible = traces.filter((t) => t.visible && t.x.length > 0)
  const hasOverlay = !!overlay && overlay.x.length > 0 && overlay.y.length > 0
  const margins = computeMargins(style)

  // Square data area: the largest square that fits the requested box.
  const plotSide = Math.max(
    10,
    Math.min(
      width - margins.left - margins.right,
      height - margins.top - margins.bottom,
    ),
  )
  const svgW = plotSide + margins.left + margins.right
  const svgH = plotSide + margins.top + margins.bottom

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
    ? scaleLog().domain([xMin, xMax]).range([0, plotSide])
    : scaleLinear().domain([xMin, xMax]).nice().range([0, plotSide])
  const yScale = yLog
    ? scaleLog().domain([yMin, yMax]).range([plotSide, 0])
    : scaleLinear().domain([yMin, yMax]).nice().range([plotSide, 0])

  const xTicks = xScale.ticks(6)
  const yTicks = yScale.ticks(6)

  const tickLen = Math.max(4, Math.round(style.fontSize * 0.35))
  const tickDir = style.tickInward ? -1 : 1 // inward = into the plotting area
  const labelGap = Math.round(style.fontSize * 0.45)

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

  // ── Legend geometry (free placement + size) ───────────────────────────────
  const showLegend = legend.visible && visible.length > 0
  const legendNames = visible.map((t) => ({
    name: t.name,
    color: t.color,
    lineWidth: t.lineWidth ?? DEFAULT_LINE_WIDTH,
  }))
  // Include the FP comb as its own legend entry when markers are shown.
  if (verticalLines && verticalLines.length > 0 && verticalLineLabel) {
    legendNames.push({ name: verticalLineLabel, color: MARKER, lineWidth: 2 })
  }
  const legendFs = style.fontSize * legend.scale
  const legendBoxW =
    legendNames.length > 0
      ? Math.max(...legendNames.map((l) => l.name.length * legendFs * 0.52)) +
        legendFs * 2.4
      : 0
  const legendLineH = legendFs * 1.35
  const legendBoxH = legendNames.length * legendLineH + legendFs * 0.6

  // Clamp the legend so it always stays inside the plot frame.
  const maxXFrac = Math.max(0, 1 - legendBoxW / plotSide)
  const maxYFrac = Math.max(0, 1 - legendBoxH / plotSide)
  const legendX = clamp(legend.x, 0, maxXFrac) * plotSide
  const legendY = clamp(legend.y, 0, maxYFrac) * plotSide

  // ── Drag / resize the legend ──────────────────────────────────────────────
  const dragRef = React.useRef<{
    mode: 'move' | 'resize'
    startX: number
    startY: number
    start: LegendLayout
  } | null>(null)

  const toPlot = (e: React.PointerEvent): { x: number; y: number } => {
    const svg = innerRef.current
    if (!svg) return { x: 0, y: 0 }
    const rect = svg.getBoundingClientRect()
    const sx = rect.width > 0 ? svgW / rect.width : 1
    const sy = rect.height > 0 ? svgH / rect.height : 1
    return {
      x: (e.clientX - rect.left) * sx - margins.left,
      y: (e.clientY - rect.top) * sy - margins.top,
    }
  }

  const beginDrag = (mode: 'move' | 'resize') => (e: React.PointerEvent) => {
    if (!onLegendChange) return
    e.stopPropagation()
    try {
      ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    } catch {
      // non-fatal: pointer capture unavailable
    }
    const p = toPlot(e)
    dragRef.current = { mode, startX: p.x, startY: p.y, start: legend }
  }

  const onDragMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d || !onLegendChange) return
    const p = toPlot(e)
    if (d.mode === 'move') {
      onLegendChange({
        ...d.start,
        x: clamp(d.start.x + (p.x - d.startX) / plotSide, 0, maxXFrac),
        y: clamp(d.start.y + (p.y - d.startY) / plotSide, 0, maxYFrac),
      })
    } else {
      onLegendChange({
        ...d.start,
        scale: clamp(d.start.scale + (p.x - d.startX) / 180, 0.5, 3),
      })
    }
  }

  const endDrag = (e: React.PointerEvent) => {
    if (dragRef.current) {
      try {
        ;(e.currentTarget as Element).releasePointerCapture?.(e.pointerId)
      } catch {
        // non-fatal
      }
      dragRef.current = null
    }
  }

  const interactive = !!onLegendChange
  const handleSize = Math.max(7, legendFs * 0.42)

  return (
    <svg
      ref={setSvg}
      id="plot-svg"
      xmlns="http://www.w3.org/2000/svg"
      width={svgW}
      height={svgH}
      viewBox={`0 0 ${svgW} ${svgH}`}
      style={{
        fontFamily: style.fontFamily,
        maxWidth: '100%',
        maxHeight: '100%',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {/* Outer canvas background */}
      <rect x={0} y={0} width={svgW} height={svgH} fill={PAPER} />

      <g transform={`translate(${margins.left},${margins.top})`}>
        {/* Plot area background */}
        <rect x={0} y={0} width={plotSide} height={plotSide} fill={PAPER} />

        {/* X ticks */}
        {xTicks.map((tv, i) => {
          const px = xScale(tv)
          if (!Number.isFinite(px)) return null
          return (
            <g key={`xt-${i}`}>
              <line
                x1={px}
                y1={plotSide}
                x2={px}
                y2={plotSide + tickDir * tickLen}
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
                y={plotSide + tickLen + labelGap}
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
                  x1={plotSide}
                  y1={py}
                  x2={plotSide + tickDir * tickLen}
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
            width={plotSide}
            height={plotSide}
            fill="none"
            stroke={INK}
            strokeWidth={style.axisThickness}
          />
        ) : (
          <>
            <line
              x1={0}
              y1={plotSide}
              x2={plotSide}
              y2={plotSide}
              stroke={INK}
              strokeWidth={style.axisThickness}
            />
            <line
              x1={0}
              y1={0}
              x2={0}
              y2={plotSide}
              stroke={INK}
              strokeWidth={style.axisThickness}
            />
          </>
        )}

        {/* Traces (clipped to plot area) */}
        <clipPath id="plot-clip">
          <rect x={0} y={0} width={plotSide} height={plotSide} />
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
              strokeWidth={2}
              strokeDasharray="6 4"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}
          {/* Vertical marker lines (FP fitted peak wavelengths). */}
          {verticalLines?.map((vx, i) => {
            if (!Number.isFinite(vx) || (xLog && vx <= 0)) return null
            const px = xScale(vx)
            if (!Number.isFinite(px)) return null
            return (
              <line
                key={`vline-${i}`}
                x1={px}
                y1={0}
                x2={px}
                y2={plotSide}
                stroke={MARKER}
                strokeWidth={2}
                strokeOpacity={0.7}
              />
            )
          })}
        </g>

        {/* Legend — draggable & resizable */}
        {showLegend && (
          <g
            transform={`translate(${legendX},${legendY})`}
            onPointerDown={beginDrag('move')}
            onPointerMove={onDragMove}
            onPointerUp={endDrag}
            style={
              interactive
                ? { cursor: 'move', touchAction: 'none' }
                : undefined
            }
          >
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
              const cy = legendFs * 0.3 + legendLineH * (i + 0.5)
              return (
                <g key={`lg-${i}`}>
                  <line
                    x1={legendFs * 0.5}
                    y1={cy}
                    x2={legendFs * 1.8}
                    y2={cy}
                    stroke={l.color}
                    strokeWidth={l.lineWidth}
                  />
                  <text
                    x={legendFs * 2.1}
                    y={cy}
                    dominantBaseline="middle"
                    fontSize={legendFs}
                    fontFamily={style.fontFamily}
                    fill={INK}
                  >
                    {l.name}
                  </text>
                </g>
              )
            })}
            {/* Resize handle (UI chrome — excluded from export) */}
            {interactive && (
              <rect
                data-noexport=""
                x={legendBoxW - handleSize}
                y={legendBoxH - handleSize}
                width={handleSize}
                height={handleSize}
                fill={ACCENT}
                fillOpacity={0.85}
                onPointerDown={beginDrag('resize')}
                onPointerMove={onDragMove}
                onPointerUp={endDrag}
                style={{ cursor: 'nwse-resize', touchAction: 'none' }}
              />
            )}
          </g>
        )}
      </g>

      {/* X axis label */}
      <text
        x={margins.left + plotSide / 2}
        y={svgH - Math.round(style.fontSize * 0.4)}
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
        y={margins.top + plotSide / 2}
        textAnchor="middle"
        fontSize={style.fontSize}
        fontFamily={style.fontFamily}
        fill={INK}
        transform={`rotate(-90 ${Math.round(style.fontSize * 0.9)} ${margins.top + plotSide / 2})`}
      >
        {yLabel}
      </text>
    </svg>
  )
})

export default PlotView
