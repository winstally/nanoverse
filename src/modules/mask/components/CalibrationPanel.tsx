'use client'

import { Label } from '@/components/ui/label'
import { NumberField } from '@/components/app/NumberField'
import { Calibration, umPerPx } from '@/modules/mask/calibration'

interface CalibrationPanelProps {
  cal: Calibration
  /** Change the objective magnification (rescales µm/cm inversely). */
  onMagnification: (magnification: number) => void
  /** Recalibrate µm-per-cm at the current magnification. */
  onUmPerCm: (umPerCm: number) => void
  /** Change the DMD resolution (px); height follows to keep pixels square. */
  onDmd: (w: number, h: number) => void
}

/**
 * Calibration controls. The substrate scale is "at <magnification>×, 1 cm of
 * design = <µm> on the substrate"; µm/cm is inversely proportional to the
 * magnification, so changing the lens rescales it automatically, while entering
 * µm/cm directly recalibrates. The DMD resolution sets the exported pixel grid;
 * pixels are square by construction, so the field height follows its aspect.
 * Lives in a collapsed-by-default accordion since these rarely change.
 */
export function CalibrationPanel({
  cal,
  onMagnification,
  onUmPerCm,
  onDmd,
}: CalibrationPanelProps) {
  const pitch = umPerPx(cal) // µm/px

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label className="text-muted-foreground">倍率と寸法</Label>
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="倍率"
            unit="×"
            value={cal.magnification}
            min={0.1}
            step={1}
            onChange={onMagnification}
          />
          <NumberField
            label="1cm ="
            unit="µm"
            value={cal.umPerCm}
            min={0.01}
            step={0.5}
            onChange={onUmPerCm}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          <span className="tnum text-foreground">
            {cal.substrateWUm.toFixed(1)} × {cal.substrateHUm.toFixed(1)} µm
          </span>{' '}
          ・ <span className="tnum text-foreground">{pitch.toFixed(3)}</span> µm/px
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-muted-foreground">露光解像度</Label>
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="幅"
            unit="px"
            value={cal.dmdW}
            min={1}
            step={1}
            onChange={(v) => onDmd(v, cal.dmdH)}
          />
          <NumberField
            label="高さ"
            unit="px"
            value={cal.dmdH}
            min={1}
            step={1}
            onChange={(v) => onDmd(cal.dmdW, v)}
          />
        </div>
      </div>
    </div>
  )
}
