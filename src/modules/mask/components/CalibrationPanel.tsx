'use client'

import { Label } from '@/components/ui/label'
import { NumberField } from '@/components/app/NumberField'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Calibration, fieldHeightUm } from '@/modules/mask/calibration'
import { Polarity } from '@/modules/mask/document'

interface CalibrationPanelProps {
  cal: Calibration
  onCalChange: (cal: Calibration) => void
  polarity: Polarity
  onPolarityChange: (p: Polarity) => void
}

/**
 * Calibration controls — DMD resolution and polarity. Pixels are square by
 * construction (uniform projection magnification), so the field height follows
 * the DMD aspect ratio automatically. Lives inside a collapsed-by-default
 * accordion since these rarely change between exports.
 */
export function CalibrationPanel({
  cal,
  onCalChange,
  polarity,
  onPolarityChange,
}: CalibrationPanelProps) {
  const setDmd = (key: 'dmdW' | 'dmdH', v: number) => {
    if (Number.isFinite(v) && v > 0) {
      // Re-derive the field height so pixels stay square after a resolution change.
      const next = { ...cal, [key]: Math.round(v) }
      onCalChange({ ...next, substrateHUm: fieldHeightUm(next) })
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="DMD 幅"
          unit="px"
          value={cal.dmdW}
          min={1}
          step={1}
          onChange={(v) => setDmd('dmdW', v)}
        />
        <NumberField
          label="DMD 高さ"
          unit="px"
          value={cal.dmdH}
          min={1}
          step={1}
          onChange={(v) => setDmd('dmdH', v)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-muted-foreground">極性</Label>
        <ToggleGroup
          value={[polarity]}
          onValueChange={(next) => {
            const v = next[0] as Polarity | undefined
            if (v) onPolarityChange(v)
          }}
          variant="outline"
          spacing={0}
          className="grid w-full grid-cols-2"
          aria-label="極性"
        >
          <ToggleGroupItem
            value="darkOnLight"
            aria-label="白地に黒"
            className="gap-1.5 data-[state=on]:!bg-primary data-[state=on]:!text-primary-foreground"
          >
            <Swatch bg="#ffffff" fg="#090909" />
            白地に黒
          </ToggleGroupItem>
          <ToggleGroupItem
            value="lightOnDark"
            aria-label="黒地に白"
            className="gap-1.5 data-[state=on]:!bg-primary data-[state=on]:!text-primary-foreground"
          >
            <Swatch bg="#090909" fg="#ffffff" />
            黒地に白
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
    </div>
  )
}

/**
 * Tiny polarity preview swatch. Black/white fills are the mask artifact itself,
 * a documented bare-hex exception (the substrate/feature colours, not theme chrome).
 */
function Swatch({ bg, fg }: { bg: string; fg: string }) {
  return (
    <span
      className="flex size-4 items-center justify-center rounded-[3px] border border-border text-[8px] font-bold"
      style={{ background: bg, color: fg }}
      aria-hidden
    >
      A
    </span>
  )
}
