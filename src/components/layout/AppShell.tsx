'use client'

import * as React from 'react'
import { PrimaryRail } from './PrimaryRail'
import { MainCard } from './MainCard'

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-full gap-1.5 overflow-hidden bg-bg p-1.5">
      <PrimaryRail />
      <MainCard>{children}</MainCard>
    </div>
  )
}
