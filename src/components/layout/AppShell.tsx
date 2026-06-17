'use client'

import * as React from 'react'
import { PrimaryRail } from './PrimaryRail'
import { MainCard } from './MainCard'

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
      <MainCard>{children}</MainCard>
    </div>
  )
}
