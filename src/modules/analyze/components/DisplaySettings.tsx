'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { BaselineMode, LegendPosition } from '../types'

export interface DisplaySettingsProps {
  legendPosition: LegendPosition
  onLegendPosition: (p: LegendPosition) => void
  baselineMode: BaselineMode
  onBaselineMode: (m: BaselineMode) => void
  className?: string
}

const LEGEND_OPTIONS: { value: LegendPosition; label: string }[] = [
  { value: 'top-right', label: '右上' },
  { value: 'top-left', label: '左上' },
  { value: 'bottom-right', label: '右下' },
  { value: 'bottom-left', label: '左下' },
  { value: 'none', label: 'なし' },
]

const BASELINE_OPTIONS: { value: BaselineMode; label: string }[] = [
  { value: 'none', label: 'なし' },
  { value: 'min', label: '最小値を引く' },
  { value: 'endpoints', label: '直線(両端)' },
]

/** Infrequently-changed plot display settings — lives inside an accordion. */
export function DisplaySettings({
  legendPosition,
  onLegendPosition,
  baselineMode,
  onBaselineMode,
  className,
}: DisplaySettingsProps) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-col gap-1.5">
        <Label className="text-muted-foreground">凡例の位置</Label>
        <Select
          value={legendPosition}
          onValueChange={(v) => {
            if (v) onLegendPosition(v as LegendPosition)
          }}
        >
          <SelectTrigger className="w-full" aria-label="凡例の位置">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LEGEND_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-muted-foreground">ベースライン補正</Label>
        <Select
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
