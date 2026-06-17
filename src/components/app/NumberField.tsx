'use client'

import * as React from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export interface NumberFieldProps {
  label: string
  value: number
  onChange: (n: number) => void
  /** Optional unit shown muted inside the field's trailing edge (e.g. "µm", "nm"). */
  unit?: string
  step?: number
  min?: number
  max?: number
  disabled?: boolean
  className?: string
  id?: string
}

/**
 * Labelled numeric input built on shadcn Input + Label, with an optional unit
 * suffix shown in muted text inside the field. Numbers use tabular figures.
 *
 * onChange fires with the parsed number; empty / unparseable input is ignored
 * (the field keeps the typed text so the user can finish editing).
 */
export function NumberField({
  label,
  value,
  onChange,
  unit,
  step,
  min,
  max,
  disabled,
  className,
  id,
}: NumberFieldProps) {
  const reactId = React.useId()
  const inputId = id ?? reactId

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={inputId} className="text-muted-foreground">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={inputId}
          type="number"
          inputMode="decimal"
          value={Number.isFinite(value) ? value : ''}
          step={step}
          min={min}
          max={max}
          disabled={disabled}
          onChange={(e) => {
            const next = e.currentTarget.valueAsNumber
            if (Number.isNaN(next)) return
            onChange(next)
          }}
          className={cn('tnum', unit && 'pr-9')}
        />
        {unit && (
          <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-muted-foreground select-none">
            {unit}
          </span>
        )}
      </div>
    </div>
  )
}
