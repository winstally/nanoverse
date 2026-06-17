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
  fpAFactor: number
  onFpAFactor: (n: number) => void
  onReset: () => void
  className?: string
}

/**
 * Editable calibration constants for every conversion formula used by the
 * analyzer. The formulas are shown explicitly; their constants are editable and
 * persist with the project.
 */
export function CalcCalibration({
  hc,
  onHc,
  ramanK,
  onRamanK,
  fpAFactor,
  onFpAFactor,
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
        <p className="text-[11px] text-muted-foreground">
          λ_L（励起波長）は「測定と軸」で設定します。
        </p>
      </Formula>

      <Formula title="FP 共振" expr="λ = A / (m + δ),  A = k · n_eff · L">
        <NumberField
          label="k（A 係数）"
          value={fpAFactor}
          step={1}
          min={0}
          onChange={onFpAFactor}
        />
        <p className="text-[11px] text-muted-foreground">
          既定 2000 = 2（往復）× 1000（µm→nm）。
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
