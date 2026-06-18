'use client'

import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Polarity } from '@/modules/mask/document'

interface PolarityToggleProps {
  polarity: Polarity
  onPolarityChange: (p: Polarity) => void
  className?: string
}

/** Mask polarity selector (white-on-black vs black-on-white) with preview swatches. */
export function PolarityToggle({
  polarity,
  onPolarityChange,
  className,
}: PolarityToggleProps) {
  return (
    <div className={className}>
      <Label className="text-muted-foreground">極性</Label>
      <ToggleGroup
        value={[polarity]}
        onValueChange={(next) => {
          const v = next[0] as Polarity | undefined
          if (v) onPolarityChange(v)
        }}
        variant="outline"
        spacing={0}
        className="mt-1.5 grid w-full grid-cols-2"
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
