'use client'

import * as React from 'react'
import { SquareActivity, FileDown } from 'lucide-react'
import { toast } from 'sonner'
import { downloadBlob } from '@/lib/download'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { PeakModel, FitResult } from '../fit'

export interface PeakPanelProps {
  model: PeakModel
  onModel: (m: PeakModel) => void
  overlay: boolean
  onOverlay: (v: boolean) => void
  results: FitResult[]
  canFit: boolean
  fitting: boolean
  fitMessage: string | null
  onFit: () => void
  xUnit: string
  className?: string
}

function fmt(v: number): string {
  if (!Number.isFinite(v)) return '—'
  const abs = Math.abs(v)
  if (abs !== 0 && (abs >= 1e5 || abs < 1e-3)) return v.toExponential(2)
  return v.toFixed(abs >= 100 ? 1 : 3)
}

function toCsv(results: FitResult[], xUnit: string): string {
  const header = [
    `center (${xUnit})`,
    `fwhm (${xUnit})`,
    'amplitude',
    'area',
    'model',
  ].join(',')
  const rows = results.map((r) =>
    [r.center, r.fwhm, r.amplitude, r.area, r.model].join(','),
  )
  return [header, ...rows].join('\r\n')
}

export function PeakPanel({
  model,
  onModel,
  overlay,
  onOverlay,
  results,
  canFit,
  fitting,
  fitMessage,
  onFit,
  xUnit,
  className,
}: PeakPanelProps) {
  const handleCsv = React.useCallback(() => {
    if (results.length === 0) return
    const csv = toCsv(results, xUnit)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    downloadBlob(blob, 'peaks.csv')
    toast.success('CSV を書き出しました')
  }, [results, xUnit])

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-muted-foreground">モデル</span>
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          value={[model]}
          onValueChange={(v) => {
            const next = v[0] as PeakModel | undefined
            if (next) onModel(next)
          }}
          aria-label="ピークモデル"
          className="w-full"
        >
          <ToggleGroupItem value="gaussian" className="flex-1">
            Gaussian
          </ToggleGroupItem>
          <ToggleGroupItem value="lorentzian" className="flex-1">
            Lorentzian
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="flex items-center justify-between">
        <Label htmlFor="overlay-toggle" className="text-muted-foreground">
          フィット曲線を重ねる
        </Label>
        <Switch
          id="overlay-toggle"
          checked={overlay}
          onCheckedChange={onOverlay}
          aria-label="フィット曲線を重ねる"
        />
      </div>

      <Button className="w-full" onClick={onFit} disabled={!canFit || fitting}>
        <SquareActivity />
        {fitting ? 'フィット中…' : 'フィット'}
      </Button>

      {!canFit && (
        <p className="text-xs text-muted-foreground">
          表示中のトレースが必要です
        </p>
      )}
      {fitMessage && <p className="text-xs text-destructive">{fitMessage}</p>}

      {results.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-muted text-right text-muted-foreground">
                  <th className="px-2 py-1.5 text-left font-medium">中心</th>
                  <th className="px-2 py-1.5 font-medium">FWHM</th>
                  <th className="px-2 py-1.5 font-medium">振幅</th>
                  <th className="px-2 py-1.5 font-medium">面積</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr
                    key={`${r.center}-${r.fwhm}-${r.amplitude}-${r.area}`}
                    className={cn(
                      'tnum border-t border-border text-right text-foreground',
                      i % 2 === 1 && 'bg-muted/50',
                    )}
                  >
                    <td className="px-2 py-1 text-left">{fmt(r.center)}</td>
                    <td className="px-2 py-1">{fmt(r.fwhm)}</td>
                    <td className="px-2 py-1">{fmt(r.amplitude)}</td>
                    <td className="px-2 py-1">{fmt(r.area)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={handleCsv}
          >
            <FileDown />
            CSV出力
          </Button>
        </div>
      )}
    </div>
  )
}
