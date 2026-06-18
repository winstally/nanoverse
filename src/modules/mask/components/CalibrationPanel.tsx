'use client'

import { Label } from '@/components/ui/label'
import { NumberField } from '@/components/app/NumberField'
import { Calibration, fieldHeightUm } from '@/modules/mask/calibration'

interface CalibrationPanelProps {
  cal: Calibration
  onCalChange: (cal: Calibration) => void
}

/**
 * Calibration controls — DMD resolution. Pixels are square by construction
 * (uniform projection magnification), so the field height follows the DMD aspect
 * ratio automatically. Lives inside a collapsed-by-default accordion since these
 * rarely change between exports.
 */
export function CalibrationPanel({ cal, onCalChange }: CalibrationPanelProps) {
  const setDmd = (key: 'dmdW' | 'dmdH', v: number) => {
    if (Number.isFinite(v) && v > 0) {
      // Re-derive the field height so pixels stay square after a resolution change.
      const next = { ...cal, [key]: Math.round(v) }
      onCalChange({ ...next, substrateHUm: fieldHeightUm(next) })
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label className="text-muted-foreground">露光解像度</Label>
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="幅"
            unit="px"
            value={cal.dmdW}
            min={1}
            step={1}
            onChange={(v) => setDmd('dmdW', v)}
          />
          <NumberField
            label="高さ"
            unit="px"
            value={cal.dmdH}
            min={1}
            step={1}
            onChange={(v) => setDmd('dmdH', v)}
          />
        </div>
      </div>
    </div>
  )
}
