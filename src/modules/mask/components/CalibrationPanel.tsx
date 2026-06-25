'use client'

import { NumberField } from '@/components/app/NumberField'
import { Calibration, umPerPxX, umPerPxY } from '@/modules/mask/calibration'
import { useI18n } from '@/components/app/I18nProvider'

interface CalibrationPanelProps {
  cal: Calibration
  /** Change the objective magnification for the BMP maskless projection scale. */
  onMagnification: (magnification: number) => void
  /** Recalibrate design-cm to substrate-µm for BMP maskless projection. */
  onUmPerCm: (umPerCm: number) => void
  /** Change the BMP/DMD resolution (px); height follows to keep pixels square. */
  onDmd: (w: number, h: number) => void
}

interface GdsChipPanelProps {
  widthUm: number
  heightUm: number
  onLayoutSize: (widthUm: number, heightUm: number) => void
}

/**
 * BMP maskless projection controls. These are intentionally separate from GDS
 * chip dimensions: changing magnification/DMD changes the projected raster field.
 */
export function CalibrationPanel({
  cal,
  onMagnification,
  onUmPerCm,
  onDmd,
}: CalibrationPanelProps) {
  const { t } = useI18n()
  const pitchX = umPerPxX(cal)
  const pitchY = umPerPxY(cal)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span className="px-0.5 text-sm font-medium text-muted-foreground">
          {t('mask.cal.bmpScale')}
        </span>
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label={t('mask.field.magnification')}
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
        <p className="px-0.5 text-xs text-muted-foreground">
          X <span className="tnum text-foreground">{pitchX.toFixed(3)}</span>
          {' / '}Y <span className="tnum text-foreground">{pitchY.toFixed(3)}</span> µm/px
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="px-0.5 text-sm font-medium text-muted-foreground">
          {t('mask.cal.bmpResolution')}
        </span>
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label={t('mask.field.exposureWidth')}
            unit="px"
            value={cal.dmdW}
            min={1}
            step={1}
            onChange={(v) => onDmd(v, cal.dmdH)}
          />
          <NumberField
            label={t('mask.field.exposureHeight')}
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

export function GdsChipPanel({
  widthUm,
  heightUm,
  onLayoutSize,
}: GdsChipPanelProps) {
  const { t } = useI18n()

  return (
    <div className="flex flex-col gap-2 py-1">
      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label={t('mask.field.chipWidth')}
          unit="µm"
          value={widthUm}
          min={0.1}
          step={10}
          onChange={(w) => onLayoutSize(w, heightUm)}
        />
        <NumberField
          label={t('mask.field.chipHeight')}
          unit="µm"
          value={heightUm}
          min={0.1}
          step={10}
          onChange={(h) => onLayoutSize(widthUm, h)}
        />
      </div>
    </div>
  )
}
