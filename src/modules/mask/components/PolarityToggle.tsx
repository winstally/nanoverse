'use client'

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Polarity } from '@/modules/mask/document'
import { useI18n } from '@/components/app/I18nProvider'

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
  const { t } = useI18n()
  return (
    <div className={className}>
      <span className="px-0.5 text-sm font-medium text-muted-foreground">
        {t('mask.polarity')}
      </span>
      <ToggleGroup
        value={[polarity]}
        onValueChange={(next) => {
          const v = next[0] as Polarity | undefined
          if (v) onPolarityChange(v)
        }}
        variant="outline"
        spacing={0}
        className="mt-2 grid w-full grid-cols-2"
        aria-label={t('mask.polarity')}
      >
        <ToggleGroupItem
          value="darkOnLight"
          aria-label={t('mask.polarity.darkOnLight')}
          className="gap-1.5 data-[state=on]:!bg-primary data-[state=on]:!text-primary-foreground"
        >
          <Swatch bg="#ffffff" fg="#090909" />
          {t('mask.polarity.darkOnLight')}
        </ToggleGroupItem>
        <ToggleGroupItem
          value="lightOnDark"
          aria-label={t('mask.polarity.lightOnDark')}
          className="gap-1.5 data-[state=on]:!bg-primary data-[state=on]:!text-primary-foreground"
        >
          <Swatch bg="#090909" fg="#ffffff" />
          {t('mask.polarity.lightOnDark')}
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
