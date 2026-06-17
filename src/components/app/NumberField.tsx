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
 * Editing model: the input holds its own text while focused, so the user can
 * clear it and type freely (empty / "1." / "-" intermediate states are allowed).
 * A valid number is committed to `onChange` on every keystroke; on blur the text
 * is normalised back to the committed value. While unfocused the text tracks the
 * `value` prop (so external changes — load, reset — show up).
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

  const [text, setText] = React.useState(() =>
    Number.isFinite(value) ? String(value) : '',
  )
  const focused = React.useRef(false)

  // Track external value changes while the field isn't being edited.
  React.useEffect(() => {
    if (!focused.current) {
      setText(Number.isFinite(value) ? String(value) : '')
    }
  }, [value])

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={inputId} className="text-muted-foreground">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={inputId}
          type="text"
          inputMode="decimal"
          value={text}
          step={step}
          min={min}
          max={max}
          disabled={disabled}
          onFocus={() => {
            focused.current = true
          }}
          onChange={(e) => {
            const raw = e.target.value
            setText(raw)
            const n = parseFloat(raw)
            if (Number.isFinite(n)) onChange(n)
          }}
          onBlur={() => {
            focused.current = false
            // Snap the displayed text back to the committed numeric value.
            setText(Number.isFinite(value) ? String(value) : '')
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
