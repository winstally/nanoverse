'use client'

import * as React from 'react'
import { NumberField } from '@/components/app/NumberField'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface CalcCalibrationProps {
  hc: number
  onHc: (n: number) => void
  ramanK: number
  onRamanK: (n: number) => void
  onReset: () => void
  className?: string
}

/**
 * Editable calibration constants for the conversion formulas. The FP relation is
 * shown for reference only: its factor (2000 = 2 round-trip × 1000 µm→nm) is a
 * unit/geometry constant, not a calibration value, so it is fixed.
 */
export function CalcCalibration({
  hc,
  onHc,
  ramanK,
  onRamanK,
  onReset,
  className,
}: CalcCalibrationProps) {
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <Formula title="波長 → エネルギー (eV)" expr="E = hc / λ">
        <NumberField
          label="hc"
          unit="eV·nm"
          value={hc}
          step={0.01}
          min={0}
          onChange={onHc}
        />
      </Formula>

      <Formula title="ラマンシフト (cm⁻¹)" expr="Δν = k · (1/λ_L − 1/λ)">
        <NumberField
          label="k"
          unit="nm·cm⁻¹"
          value={ramanK}
          step={100000}
          min={0}
          onChange={onRamanK}
        />
      </Formula>

      <Formula title="FP 共振" expr="λ = A / (m + δ),  A = 2000 · n_g,FP · L">
        <p className="text-xs leading-relaxed text-muted-foreground">
          係数 2000 = 2(往復) × 1000(µm→nm) の固定値で、較正値ではありません。
          得られる n_g,FP は主にピーク間隔(FSR)で決まる FP 由来の群屈折率相当で、
          位相屈折率 n_eff とは限りません（分散が無視できる場合のみ近似）。
        </p>
      </Formula>

      <Button
        variant="ghost"
        size="sm"
        onClick={onReset}
        className="self-start"
      >
        既定値に戻す
      </Button>
    </div>
  )
}

function Formula({
  title,
  expr,
  children,
}: {
  title: string
  expr: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="eyebrow">{title}</span>
      <code className="block rounded-md bg-muted px-2.5 py-1.5 text-xs text-foreground">
        {expr}
      </code>
      {children}
    </div>
  )
}
