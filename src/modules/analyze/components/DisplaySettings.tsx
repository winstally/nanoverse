'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { BaselineMode } from '../types'

export interface DisplaySettingsProps {
  legendVisible: boolean
  onLegendVisible: (v: boolean) => void
  onLegendReset: () => void
  baselineMode: BaselineMode
  onBaselineMode: (m: BaselineMode) => void
  className?: string
}

const BASELINE_OPTIONS: { value: BaselineMode; label: string }[] = [
  { value: 'none', label: 'なし' },
  { value: 'min', label: '最小値を引く' },
  { value: 'endpoints', label: '直線(両端)' },
]

/** Infrequently-changed plot display settings — lives inside an accordion. */
export function DisplaySettings({
  legendVisible,
  onLegendVisible,
  onLegendReset,
  baselineMode,
  onBaselineMode,
  className,
}: DisplaySettingsProps) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-muted-foreground">凡例</Label>
          <Switch
            checked={legendVisible}
            onCheckedChange={onLegendVisible}
            aria-label="凡例を表示"
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            プロット上でドラッグして移動・サイズ変更
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={onLegendReset}
            disabled={!legendVisible}
          >
            位置をリセット
          </Button>
        </div>
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
