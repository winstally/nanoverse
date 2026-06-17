'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { NumberField } from '@/components/app/NumberField'
import type { AxisMode, MeasurementType } from '../types'

export interface AxisControlsProps {
  type: MeasurementType
  onType: (t: MeasurementType) => void
  xMode: AxisMode
  onXMode: (m: AxisMode) => void
  laserNm: number
  onLaserNm: (nm: number) => void
  normalize: boolean
  onNormalize: (v: boolean) => void
  className?: string
}

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
  normalize,
  onNormalize,
  className,
}: AxisControlsProps) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-col gap-1.5">
        <Label className="text-muted-foreground">測定</Label>
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
          <Label className="text-muted-foreground">横軸</Label>
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

      <div className="flex items-center justify-between">
        <Label htmlFor="normalize-toggle" className="text-muted-foreground">
          正規化 <span className="text-muted-foreground/70">(最大=1)</span>
        </Label>
        <Switch
          id="normalize-toggle"
          checked={normalize}
          onCheckedChange={onNormalize}
          aria-label="正規化"
        />
      </div>
    </div>
  )
}
