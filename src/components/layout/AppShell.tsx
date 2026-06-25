'use client'

import * as React from 'react'

/**
 * App frame background. Tool pages own the photoverse-style primary rail,
 * animated sidebar, and white work-surface card through `ToolLayout`.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex h-[100dvh] w-full overflow-hidden bg-white p-[3px] lg:p-0"
      style={{
        paddingLeft: 'max(3px, env(safe-area-inset-left))',
        paddingRight: 'max(3px, env(safe-area-inset-right))',
        paddingTop: 'max(3px, env(safe-area-inset-top))',
        paddingBottom: 'max(3px, env(safe-area-inset-bottom))',
      }}
    >
      {children}
    </div>
  )
}
