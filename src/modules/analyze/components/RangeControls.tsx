'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { NumberField } from '@/components/app/NumberField'

/** Manual axis bounds in the current plot coordinate space (undefined = auto). */
export interface AxisRange {
  xMin?: number
  xMax?: number
  yMin?: number
  yMax?: number
}

export interface RangeControlsProps {
  range: AxisRange
  /** Current auto (data) extent in plot coords — seeds the fields on switch to manual. */
  xAuto: [number, number]
  yAuto: [number, number]
  onChange: (next: AxisRange) => void
  xLog: boolean
  yLog: boolean
  onXLog: (v: boolean) => void
  onYLog: (v: boolean) => void
  className?: string
}

/** Round to ~4 significant figures so seeded bounds read cleanly. */
function nice(v: number): number {
  if (!Number.isFinite(v) || v === 0) return 0
  return Number(v.toPrecision(4))
}

/** A clean slider step (~1/100 of the span, snapped to 1/2/5×10ⁿ). */
function niceStep(span: number): number {
  if (!(span > 0)) return 1
  const raw = span / 100
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const n = raw / mag
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag
}

/**
 * Per-axis range control. Each axis defaults to autoscale (a single "自動"
 * switch); turning it off reveals 最小 / 最大 fields seeded from the current
 * data extent, so the user nudges from sensible values. Bounds are in the
 * plot's current units (nm/eV, cm⁻¹, 2θ, intensity) and reset when those change.
 */
export function RangeControls({
  range,
  xAuto,
  yAuto,
  onChange,
  xLog,
  yLog,
  onXLog,
  onYLog,
  className,
}: RangeControlsProps) {
  const xManual = range.xMin != null || range.xMax != null
  const yManual = range.yMin != null || range.yMax != null

  const setAuto = (axis: 'x' | 'y', auto: boolean) => {
    if (axis === 'x') {
      onChange({
        ...range,
        xMin: auto ? undefined : nice(xAuto[0]),
        xMax: auto ? undefined : nice(xAuto[1]),
      })
    } else {
      onChange({
        ...range,
        yMin: auto ? undefined : nice(yAuto[0]),
        yMax: auto ? undefined : nice(yAuto[1]),
      })
    }
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <Axis
        label="横軸"
        manual={xManual}
        log={xLog}
        onLog={onXLog}
        min={range.xMin ?? nice(xAuto[0])}
        max={range.xMax ?? nice(xAuto[1])}
        bound={[
          Math.min(xAuto[0], range.xMin ?? xAuto[0]),
          Math.max(xAuto[1], range.xMax ?? xAuto[1]),
        ]}
        onAuto={(a) => setAuto('x', a)}
        onMin={(v) => onChange({ ...range, xMin: v })}
        onMax={(v) => onChange({ ...range, xMax: v })}
        onRange={(lo, hi) => onChange({ ...range, xMin: lo, xMax: hi })}
      />
      <Axis
        label="縦軸"
        manual={yManual}
        log={yLog}
        onLog={onYLog}
        min={range.yMin ?? nice(yAuto[0])}
        max={range.yMax ?? nice(yAuto[1])}
        bound={[
          Math.min(yAuto[0], range.yMin ?? yAuto[0]),
          Math.max(yAuto[1], range.yMax ?? yAuto[1]),
        ]}
        onAuto={(a) => setAuto('y', a)}
        onMin={(v) => onChange({ ...range, yMin: v })}
        onMax={(v) => onChange({ ...range, yMax: v })}
        onRange={(lo, hi) => onChange({ ...range, yMin: lo, yMax: hi })}
      />
    </div>
  )
}

function Axis({
  label,
  manual,
  log,
  onLog,
  min,
  max,
  bound,
  onAuto,
  onMin,
  onMax,
  onRange,
}: {
  label: string
  manual: boolean
  log: boolean
  onLog: (v: boolean) => void
  min: number
  max: number
  bound: [number, number]
  onAuto: (auto: boolean) => void
  onMin: (v: number) => void
  onMax: (v: number) => void
  onRange: (lo: number, hi: number) => void
}) {
  const [bLo, bHi] = bound
  const step = niceStep(bHi - bLo)
  const clamp = (v: number) => Math.max(bLo, Math.min(v, bHi))
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <span className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            log
            <Switch
              checked={log}
              onCheckedChange={(v) => onLog(v)}
              size="sm"
              aria-label={`${label}を対数にする`}
            />
          </span>
          <span className="flex items-center gap-1.5">
            自動
            <Switch
              checked={!manual}
              onCheckedChange={(v) => onAuto(v)}
              size="sm"
              aria-label={`${label}を自動にする`}
            />
          </span>
        </span>
      </div>
      {manual && (
        <div className="flex flex-col gap-2.5 pt-0.5">
          {bHi > bLo && (
            <Slider
              min={bLo}
              max={bHi}
              step={step}
              value={[clamp(min), clamp(max)]}
              onValueChange={(v) => {
                const a = Array.isArray(v) ? v : [v]
                if (a.length === 2 && a[0] < a[1]) onRange(a[0], a[1])
              }}
              aria-label={`${label}の範囲スライダー`}
            />
          )}
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="最小"
              value={min}
              onChange={(v) => {
                if (Number.isFinite(v)) onMin(v)
              }}
            />
            <NumberField
              label="最大"
              value={max}
              onChange={(v) => {
                if (Number.isFinite(v)) onMax(v)
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
