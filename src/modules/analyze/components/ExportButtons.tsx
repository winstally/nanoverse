'use client'

import * as React from 'react'
import { FileImage, FileDown } from 'lucide-react'
import { toast } from 'sonner'
import { downloadBlob } from '@/lib/download'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/components/app/I18nProvider'
import { exportPng } from '../plot/export'
import { buildPxp } from '../pxp-export'
import type { PxpExportOptions } from '../pxp-export'
import type { Trace } from '../types'

export interface ExportButtonsProps {
  getSvg: () => SVGSVGElement | null
  /** Visible traces in the same coordinate/value space as the rendered plot. */
  getTraces?: () => Trace[]
  getPxpOptions?: () => PxpExportOptions
  baseName?: string
  disabled?: boolean
  className?: string
}

export function ExportButtons({
  getSvg,
  getTraces,
  getPxpOptions,
  baseName = 'spectrum',
  disabled,
  className,
}: ExportButtonsProps) {
  const { t } = useI18n()
  const handlePng = React.useCallback(async () => {
    const svg = getSvg()
    if (!svg) return
    try {
      await exportPng(svg, `${baseName}.png`, 2)
      toast.success(t('analyze.pngExported'))
    } catch {
      toast.error(t('analyze.pngExportFailed'))
    }
  }, [getSvg, baseName, t])

  const handlePxp = React.useCallback(() => {
    const traces = getTraces?.() ?? []
    if (traces.length === 0) {
      toast.error(t('analyze.noExportTraces'))
      return
    }
    try {
      const blob = buildPxp(traces, getPxpOptions?.())
      downloadBlob(blob, `${baseName}.pxp`)
      toast.success(t('analyze.pxpExported', { count: traces.length }))
    } catch {
      toast.error(t('analyze.pxpExportFailed'))
    }
  }, [getTraces, getPxpOptions, baseName, t])

  return (
    <div className={cn('grid grid-cols-2 gap-2', className)}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => void handlePng()}
        disabled={disabled}
        title={t('analyze.pngTitle')}
      >
        <FileImage />
        PNG
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={handlePxp}
        disabled={disabled || !getTraces}
        title={t('analyze.pxpTitle')}
      >
        <FileDown />
        Igor .pxp
      </Button>
    </div>
  )
}
