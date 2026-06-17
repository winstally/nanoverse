'use client'

import * as React from 'react'
import { Download, FileImage } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { exportSvg, exportPng } from '../plot/export'

export interface ExportButtonsProps {
  getSvg: () => SVGSVGElement | null
  baseName?: string
  disabled?: boolean
  className?: string
}

export function ExportButtons({
  getSvg,
  baseName = 'spectrum',
  disabled,
  className,
}: ExportButtonsProps) {
  const handleSvg = React.useCallback(() => {
    const svg = getSvg()
    if (!svg) return
    exportSvg(svg, `${baseName}.svg`)
    toast.success('SVG を書き出しました')
  }, [getSvg, baseName])

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

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => void handlePng()}
        disabled={disabled}
        title="PNG出力"
        className="flex-1"
      >
        <FileImage />
        PNG
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={handleSvg}
        disabled={disabled}
        title="SVG出力"
        className="flex-1"
      >
        <Download />
        SVG
      </Button>
    </div>
  )
}
