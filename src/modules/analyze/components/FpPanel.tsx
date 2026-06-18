'use client'

import * as React from 'react'
import { SquareActivity, FileDown } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { NumberField } from '@/components/app/NumberField'
import type { FpFit, FpOptions } from '../fp'

export interface FpPanelProps {
  /** Cavity length (µm). */
  L: number
  onL: (v: number) => void
  /** Peak-search window (nm). */
  minWl: number
  onMinWl: (v: number) => void
  maxWl: number
  onMaxWl: (v: number) => void
  /** Advanced detection params. */
  advanced: Pick<
    FpOptions,
    'prominence' | 'distanceNm' | 'smoothWindow' | 'refineNm'
  >
  onAdvanced: (
    next: Pick<
      FpOptions,
      'prominence' | 'distanceNm' | 'smoothWindow' | 'refineNm'
    >,
  ) => void
  fit: FpFit | null
  canFit: boolean
  fitting: boolean
  fitMessage: string | null
  onFit: () => void
  className?: string
}

function fmt(v: number, digits = 4): string {
  if (!Number.isFinite(v)) return '—'
  const abs = Math.abs(v)
  if (abs !== 0 && (abs >= 1e5 || abs < 1e-3)) return v.toExponential(2)
  return v.toFixed(digits)
}

function toCsv(fit: FpFit): string {
  const header = ['m', 'lambda_obs_nm', 'lambda_calc_nm', 'residual_nm'].join(
    ',',
  )
  const rows = fit.modes.map((d) =>
    [
      d.m,
      d.obsNm != null ? d.obsNm.toFixed(6) : '',
      d.calcNm.toFixed(6),
      d.residualNm != null ? d.residualNm.toFixed(6) : '',
    ].join(','),
  )
  return [header, ...rows].join('\r\n')
}

/**
 * Summary metric shown in the FP result block. Value uses tabular figures.
 */
function Metric({
  label,
  value,
  unit,
}: {
  label: string
  value: string
  unit?: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="tnum text-foreground">
        {value}
        {unit && (
          <span className="ml-0.5 text-muted-foreground">{unit}</span>
        )}
      </span>
    </div>
  )
}

export function FpPanel({
  L,
  onL,
  minWl,
  onMinWl,
  maxWl,
  onMaxWl,
  advanced,
  onAdvanced,
  fit,
  canFit,
  fitting,
  fitMessage,
  onFit,
  className,
}: FpPanelProps) {
  const handleCsv = React.useCallback(() => {
    if (!fit) return
    const csv = toCsv(fit)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'fp_fit.csv'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    toast.success('CSV を書き出しました')
  }, [fit])

  // Per-adjacent-pair group index — a consistency check on the continuous-mode
  // assumption (all values ≈ n_g,FP if no peak is missing / spurious).
  const pairNg = fit ? fit.pairNg.filter((v) => Number.isFinite(v)) : []
  const ngMin = pairNg.length ? Math.min(...pairNg) : NaN
  const ngMax = pairNg.length ? Math.max(...pairNg) : NaN

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <NumberField
        label="キャビティ長"
        unit="µm"
        value={L}
        min={0.1}
        step={0.1}
        onChange={(v) => {
          if (Number.isFinite(v) && v > 0) onL(v)
        }}
      />

      <div className="flex flex-col gap-1.5">
        <Label className="text-muted-foreground">探索範囲</Label>
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="最小"
            unit="nm"
            value={minWl}
            step={1}
            onChange={(v) => {
              if (Number.isFinite(v)) onMinWl(v)
            }}
          />
          <NumberField
            label="最大"
            unit="nm"
            value={maxWl}
            step={1}
            onChange={(v) => {
              if (Number.isFinite(v)) onMaxWl(v)
            }}
          />
        </div>
      </div>

      {/* Advanced detection params (collapsed by default). */}
      <Accordion>
        <AccordionItem value="fp-advanced" className="border-t border-border">
          <AccordionTrigger variant="section">詳細パラメータ</AccordionTrigger>
          <AccordionContent>
            <div className="flex flex-col gap-3 pt-1">
              <NumberField
                label="突出度"
                value={advanced.prominence}
                min={0}
                step={10}
                onChange={(v) => {
                  if (Number.isFinite(v) && v >= 0)
                    onAdvanced({ ...advanced, prominence: v })
                }}
              />
              <NumberField
                label="間隔"
                unit="nm"
                value={advanced.distanceNm}
                min={0}
                step={1}
                onChange={(v) => {
                  if (Number.isFinite(v) && v >= 0)
                    onAdvanced({ ...advanced, distanceNm: v })
                }}
              />
              <NumberField
                label="平滑化窓"
                value={advanced.smoothWindow}
                min={3}
                step={2}
                onChange={(v) => {
                  if (Number.isFinite(v) && v >= 3)
                    onAdvanced({ ...advanced, smoothWindow: v })
                }}
              />
              <NumberField
                label="精密化"
                unit="nm"
                value={advanced.refineNm}
                min={0}
                step={0.5}
                onChange={(v) => {
                  if (Number.isFinite(v) && v >= 0)
                    onAdvanced({ ...advanced, refineNm: v })
                }}
              />
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Button className="w-full" onClick={onFit} disabled={!canFit || fitting}>
        <SquareActivity />
        {fitting ? 'フィット中…' : 'FPフィット'}
      </Button>

      {!canFit && (
        <p className="text-xs text-muted-foreground">
          表示中のトレースが必要です
        </p>
      )}
      {fitMessage && <p className="text-xs text-destructive">{fitMessage}</p>}

      {fit && (
        <div className="flex flex-col gap-2">
          {/* Summary block */}
          <div className="tnum flex flex-col gap-1 rounded-md border border-border bg-muted/40 p-2.5 text-xs">
            <Metric label="n_g,FP" value={fmt(fit.ngFp)} />
            <Metric label="δ" value={fmt(fit.delta)} />
            <Metric label="A" value={fmt(fit.A, 3)} unit=" nm" />
            <Metric label="RMSE" value={fmt(fit.rmseNm, 3)} unit=" nm" />
            <Metric
              label="モード数"
              value={`${fit.modes.filter((d) => d.obsNm != null).length} / ${fit.modes.length}`}
            />
            <Metric label="m_start" value={String(fit.mStart)} />
            {fit.effectiveProminence != null && (
              <Metric
                label="検出突出度"
                value={fmt(
                  fit.effectiveProminence,
                  fit.effectiveProminence >= 100 ? 0 : 2,
                )}
              />
            )}
          </div>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            n_g,FP は FP 由来の群屈折率相当（主に FSR で決定）で、位相屈折率 n_eff
            とは限りません。m_start は相対番号で絶対モード番号ではありません（+1 で δ
            が −1 されるだけ）。
          </p>

          {/* Per-pair group index — consistency check for the continuous-mode model. */}
          {pairNg.length > 0 && (
            <div className="flex flex-col gap-1 rounded-md border border-border bg-muted/40 p-2.5 text-xs">
              <Metric
                label="隣接ピア間 n_g"
                value={`${fmt(ngMin, 3)}–${fmt(ngMax, 3)}`}
              />
              <div className="tnum flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                {pairNg.map((v, i) => (
                  <span key={i}>{fmt(v, 3)}</span>
                ))}
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                ※ 連続モード(Δm=1)を仮定し各隣接ピーク対から算出。値が揃わない場合は
                ピーク欠落/混入の疑いがあります。
              </p>
            </div>
          )}

          {/* Per-mode table */}
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-muted text-right text-muted-foreground">
                  <th className="px-2 py-1.5 text-left font-medium">m</th>
                  <th className="px-2 py-1.5 font-medium">λ_obs</th>
                  <th className="px-2 py-1.5 font-medium">λ_calc</th>
                  <th className="px-2 py-1.5 font-medium">残差</th>
                </tr>
              </thead>
              <tbody>
                {fit.modes.map((d, i) => (
                  <tr
                    key={d.m}
                    className={cn(
                      'tnum border-t border-border text-right',
                      i % 2 === 1 && 'bg-muted/50',
                      d.obsNm != null
                        ? 'text-foreground'
                        : 'text-muted-foreground',
                    )}
                  >
                    <td className="px-2 py-1 text-left">{d.m}</td>
                    <td className="px-2 py-1">
                      {d.obsNm != null ? fmt(d.obsNm, 2) : '—'}
                    </td>
                    <td className="px-2 py-1">{fmt(d.calcNm, 2)}</td>
                    <td className="px-2 py-1">
                      {d.residualNm != null ? fmt(d.residualNm, 3) : '—'}
                    </td>
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
