'use client'

import * as React from 'react'
import { PrimaryRail } from './PrimaryRail'

/**
 * App frame: the Primary Rail plus the page region. The page region is left to
 * `ToolLayout`, which renders the control panel as a sidebar (blended into this
 * frame background) and wraps only the work surface in a white card — matching
 * photoverse's "flush" layout where the sidebar sits outside the card.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex h-[100dvh] w-full gap-1.5 overflow-hidden bg-bg p-1.5"
      style={{
        paddingLeft: 'max(0.375rem, env(safe-area-inset-left))',
        paddingRight: 'max(0.375rem, env(safe-area-inset-right))',
        paddingTop: 'max(0.375rem, env(safe-area-inset-top))',
        paddingBottom: 'max(0.375rem, env(safe-area-inset-bottom))',
      }}
    >
      <PrimaryRail />
      {children}
    </div>
  )
}
