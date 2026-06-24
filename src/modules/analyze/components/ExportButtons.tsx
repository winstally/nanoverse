'use client'

import * as React from 'react'
import { FileImage, FileDown } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { exportPng } from '../plot/export'
import { buildPxp } from '../pxp-export'
import type { Trace } from '../types'

export interface ExportButtonsProps {
  getSvg: () => SVGSVGElement | null
  /** Visible traces (raw native x/y) to export as Igor waves. */
  getTraces?: () => Trace[]
  baseName?: string
  disabled?: boolean
  className?: string
}

export function ExportButtons({
  getSvg,
  getTraces,
  baseName = 'spectrum',
  disabled,
  className,
}: ExportButtonsProps) {
  const handlePng = React.useCallback(async () => {
    const svg = getSvg()
    if (!svg) return
    try {
      await exportPng(svg, `${baseName}.png`, 2)
      toast.success('PNG を書き出しました')
    } catch {
      toast.error('PNG の書き出しに失敗しました')
    }
  }, [getSvg, baseName])

  const handlePxp = React.useCallback(() => {
    const traces = getTraces?.() ?? []
    if (traces.length === 0) {
      toast.error('書き出すトレースがありません')
      return
    }
    try {
      const blob = buildPxp(traces)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${baseName}.pxp`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success(`${traces.length} 波形を .pxp で書き出しました`)
    } catch {
      toast.error('.pxp の書き出しに失敗しました')
    }
  }, [getTraces, baseName])

  return (
    <div className={cn('grid grid-cols-2 gap-2', className)}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => void handlePng()}
        disabled={disabled}
        title="PNG出力"
      >
        <FileImage />
        PNG
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={handlePxp}
        disabled={disabled || !getTraces}
        title="Igor .pxp 出力"
      >
        <FileDown />
        Igor .pxp
      </Button>
    </div>
  )
}
