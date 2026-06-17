'use client'

import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { NumberField } from '@/components/app/NumberField'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Calibration, umPerPx } from '@/modules/mask/calibration'
import { Polarity } from '@/modules/mask/document'

interface CalibrationPanelProps {
  cal: Calibration
  onCalChange: (cal: Calibration) => void
  polarity: Polarity
  onPolarityChange: (p: Polarity) => void
}

/**
 * Calibration controls — DMD resolution, isotropic pixels, polarity. Lives inside
 * a collapsed-by-default accordion since these rarely change between exports.
 */
export function CalibrationPanel({
  cal,
  onCalChange,
  polarity,
  onPolarityChange,
}: CalibrationPanelProps) {
  const upp = umPerPx(cal)

  const setDmd = (key: 'dmdW' | 'dmdH', v: number) => {
    if (Number.isFinite(v) && v > 0) {
      onCalChange({ ...cal, [key]: Math.round(v) })
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

      <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2">
        <div className="flex flex-col">
          <Label>等方ピクセル</Label>
          <span className="mt-0.5 text-[10px] text-muted-foreground">
            X 軸基準の正方形ピクセル
          </span>
        </div>
        <Switch
          checked={cal.isotropic}
          onCheckedChange={(isotropic) => onCalChange({ ...cal, isotropic })}
          aria-label="等方ピクセル"
        />
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs">
        <div className="flex flex-col">
          <span className="text-[10px] font-medium tracking-wide text-muted-foreground">
            µm/px X
          </span>
          <span className="mt-0.5 tnum font-medium text-foreground">
            {upp.x.toFixed(4)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] font-medium tracking-wide text-muted-foreground">
            µm/px Y
          </span>
          <span className="mt-0.5 tnum font-medium text-foreground">
            {upp.y.toFixed(4)}
          </span>
        </div>
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

      <p className="text-[10px] leading-relaxed text-muted-foreground">
        基板 <span className="tnum">{cal.substrateWUm.toFixed(1)}</span> ×{' '}
        <span className="tnum">{cal.substrateHUm.toFixed(1)}</span> µm
      </p>
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
