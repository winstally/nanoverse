import * as React from 'react'
import { cn } from '@/lib/utils'

interface SectionLabelProps extends React.ComponentProps<'div'> {
  /** Show a trailing hairline rule that fills the remaining width. */
  rule?: boolean
}

/**
 * Instrument-panel section header. Renders a `.eyebrow` span, optionally followed
 * by a thin rule. Used everywhere for section headings.
 */
export function SectionLabel({
  children,
  className,
  rule = false,
  ...props
}: SectionLabelProps) {
  return (
    <div className={cn('flex items-center gap-2', className)} {...props}>
      <span className="eyebrow">{children}</span>
      {rule && <span className="h-px flex-1 bg-border" aria-hidden />}
    </div>
  )
}
