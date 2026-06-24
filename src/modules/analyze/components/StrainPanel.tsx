'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'
import { NumberField } from '@/components/app/NumberField'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  computeStrainTable,
  BULK_REF,
  type StrainRefs,
  type StrainSeries,
} from '../strain'

export interface StrainPanelProps {
  /** Visible traces in current plot units (cm⁻¹ for Raman). */
  traces: StrainSeries[]
  refs: StrainRefs
  onRefs: (refs: StrainRefs) => void
  /** Reference id: BULK_REF or a trace id. */
  refMode: string
  onRefMode: (id: string) => void
  className?: string
}

function cell(strain: number | null, dw: number | null): React.ReactNode {
  if (strain == null) return <span className="text-muted-foreground">—</span>
  return (
    <span
      className={cn(
        strain > 0.02 && 'text-primary',
        strain < -0.02 && 'text-destructive',
      )}
      title={dw != null ? `Δω ${dw >= 0 ? '+' : ''}${dw.toFixed(2)} cm⁻¹` : ''}
    >
      {(strain >= 0 ? '+' : '') + strain.toFixed(2)}%
    </span>
  )
}

export function StrainPanel({
  traces,
  refs,
  onRefs,
  refMode,
  onRefMode,
  className,
}: StrainPanelProps) {
  const table = React.useMemo(
    () => computeStrainTable(traces, refMode, refs),
    [traces, refMode, refs],
  )

  const refItems = React.useMemo(
    () => [
      { value: BULK_REF, label: 'バルク基準' },
      ...traces.map((t) => ({ value: t.id, label: t.name })),
    ],
    [traces],
  )

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-col gap-1.5">
        <Label className="text-muted-foreground">基準（この試料からのシフト）</Label>
        <Select
          items={refItems}
          value={refMode}
          onValueChange={(v) => v && onRefMode(v)}
        >
          <SelectTrigger className="w-full" aria-label="歪みの基準">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {refItems.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {refMode === BULK_REF && (
        <div className="flex flex-col gap-1.5">
          <Label className="text-muted-foreground">バルク基準位置</Label>
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="Si–Si"
              unit="cm⁻¹"
              value={refs.siRef}
              onChange={(v) => Number.isFinite(v) && onRefs({ ...refs, siRef: v })}
            />
            <NumberField
              label="Ge–Ge"
              unit="cm⁻¹"
              value={refs.geRef}
              onChange={(v) => Number.isFinite(v) && onRefs({ ...refs, geRef: v })}
            />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label className="text-muted-foreground">歪み係数 |Δω/ε|</Label>
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Si"
            unit="cm⁻¹"
            value={refs.siCoef}
            min={1}
            onChange={(v) =>
              Number.isFinite(v) && v > 0 && onRefs({ ...refs, siCoef: v })
            }
          />
          <NumberField
            label="Ge"
            unit="cm⁻¹"
            value={refs.geCoef}
            min={1}
            onChange={(v) =>
              Number.isFinite(v) && v > 0 && onRefs({ ...refs, geCoef: v })
            }
          />
        </div>
      </div>

      {traces.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          比較するトレースを表示してください。
        </p>
      ) : (
        <>
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full border-collapse text-[10px]">
              <thead>
                <tr className="bg-muted text-right text-muted-foreground">
                  <th className="px-1.5 py-1.5 text-left font-medium">試料</th>
                  <th className="px-1.5 py-1.5 font-medium">Ge歪み</th>
                  <th className="px-1.5 py-1.5 font-medium">Si歪み</th>
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r) => (
                  <tr
                    key={r.id}
                    className={cn(
                      'tnum border-t border-border text-right text-foreground',
                      r.isRef && 'bg-muted/60',
                    )}
                  >
                    <td className="px-1.5 py-1 text-left">
                      {r.name}
                      {r.isRef && (
                        <span className="ml-1 text-muted-foreground">(基準)</span>
                      )}
                    </td>
                    <td className="px-1.5 py-1">
                      {r.isRef && refMode !== BULK_REF
                        ? '0'
                        : cell(r.geStrain, r.geDw)}
                    </td>
                    <td className="px-1.5 py-1">
                      {r.isRef && refMode !== BULK_REF
                        ? '0'
                        : cell(r.siStrain, r.siDw)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-muted-foreground">
            基準試料からのピークシフトを歪みに換算（+引張 / −圧縮、二軸）。Δω はセルにカーソルで表示。Ge/Si
            のピークが無い試料は — 。
          </p>
        </>
      )}
    </div>
  )
}
