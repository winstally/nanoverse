'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { NumberField } from '@/components/app/NumberField'
import type { AxisMode, BaselineMode, MeasurementType } from '../types'

export interface AxisControlsProps {
  type: MeasurementType
  onType: (t: MeasurementType) => void
  xMode: AxisMode
  onXMode: (m: AxisMode) => void
  laserNm: number
  onLaserNm: (nm: number) => void
  ramanInput: 'cm' | 'nm'
  onRamanInput: (v: 'cm' | 'nm') => void
  normalize: boolean
  onNormalize: (v: boolean) => void
  legendVisible: boolean
  onLegendVisible: (v: boolean) => void
  baselineMode: BaselineMode
  onBaselineMode: (m: BaselineMode) => void
  className?: string
}

const BASELINE_OPTIONS: { value: BaselineMode; label: string }[] = [
  { value: 'none', label: 'なし' },
  { value: 'min', label: '最小値を引く' },
  { value: 'endpoints', label: '直線(両端)' },
]

/**
 * Frequently-changed measurement & axis controls, always visible in the left
 * panel. Segmented choices use shadcn ToggleGroup; the Raman laser wavelength
 * uses the foundation NumberField; normalize is a Switch.
 */
export function AxisControls({
  type,
  onType,
  xMode,
  onXMode,
  laserNm,
  onLaserNm,
  ramanInput,
  onRamanInput,
  normalize,
  onNormalize,
  legendVisible,
  onLegendVisible,
  baselineMode,
  onBaselineMode,
  className,
}: AxisControlsProps) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-muted-foreground">測定</span>
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          value={[type]}
          onValueChange={(v) => {
            const next = v[0] as MeasurementType | undefined
            if (next) onType(next)
          }}
          aria-label="測定種別"
          className="w-full"
        >
          <ToggleGroupItem value="PL" className="flex-1">
            PL
          </ToggleGroupItem>
          <ToggleGroupItem value="Raman" className="flex-1">
            Raman
          </ToggleGroupItem>
          <ToggleGroupItem value="XRD" className="flex-1">
            XRD
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {type === 'PL' && (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-muted-foreground">横軸</span>
          <ToggleGroup
            variant="outline"
            size="sm"
            spacing={0}
            value={[xMode]}
            onValueChange={(v) => {
              const next = v[0] as AxisMode | undefined
              if (next) onXMode(next)
            }}
            aria-label="横軸の単位"
            className="w-full"
          >
            <ToggleGroupItem value="nm" className="flex-1">
              nm
            </ToggleGroupItem>
            <ToggleGroupItem value="eV" className="flex-1">
              eV
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      )}

      {type === 'Raman' && (
        <>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted-foreground">横軸データ</span>
            <ToggleGroup
              variant="outline"
              size="sm"
              spacing={0}
              value={[ramanInput]}
              onValueChange={(v) => {
                const next = v[0] as 'cm' | 'nm' | undefined
                if (next) onRamanInput(next)
              }}
              aria-label="ラマンの横軸データ"
              className="w-full"
            >
              <ToggleGroupItem value="cm" className="flex-1">
                cm⁻¹
              </ToggleGroupItem>
              <ToggleGroupItem value="nm" className="flex-1">
                nm→変換
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          {ramanInput === 'nm' && (
            <NumberField
              label="励起波長"
              unit="nm"
              value={laserNm}
              min={1}
              step={1}
              onChange={(v) => {
                if (Number.isFinite(v) && v > 0) onLaserNm(v)
              }}
            />
          )}
        </>
      )}

      <div className="flex items-center justify-between">
        <Label htmlFor="normalize-toggle" className="text-muted-foreground">
          正規化
        </Label>
        <Switch
          id="normalize-toggle"
          checked={normalize}
          onCheckedChange={onNormalize}
          aria-label="正規化"
        />
      </div>

      <div className="flex items-center justify-between">
        <Label htmlFor="legend-toggle" className="text-muted-foreground">
          凡例
        </Label>
        <Switch
          id="legend-toggle"
          checked={legendVisible}
          onCheckedChange={onLegendVisible}
          aria-label="凡例を表示"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-muted-foreground">ベースライン補正</span>
        <Select
          items={BASELINE_OPTIONS}
          value={baselineMode}
          onValueChange={(v) => {
            if (v) onBaselineMode(v as BaselineMode)
          }}
        >
          <SelectTrigger className="w-full" aria-label="ベースライン補正">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BASELINE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
