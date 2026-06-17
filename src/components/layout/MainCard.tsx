import * as React from 'react'

export function MainCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-rule-2 bg-surface shadow-[0_1px_2px_rgba(20,23,28,0.04)]">
      {children}
    </div>
  )
}
