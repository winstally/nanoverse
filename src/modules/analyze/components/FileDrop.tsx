'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { FileDropzone } from '@/components/app/FileDropzone'
import { useI18n } from '@/components/app/I18nProvider'
import { parseFiles } from '../parse'
import { parsePxpFile } from '../pxp'
import type { MeasurementType, Trace } from '../types'

export interface FileDropProps {
  onTraces: (traces: Trace[]) => void
  /** Called with the measurement type auto-detected from an imported .pxp. */
  onType?: (type: MeasurementType) => void
  className?: string
}

export function FileDrop({ onTraces, onType, className }: FileDropProps) {
  const { t } = useI18n()
  const [busy, setBusy] = React.useState(false)

  const ingest = React.useCallback(
    async (list: File[]) => {
      if (list.length === 0) return
      setBusy(true)
      try {
        const all: Trace[] = []
        let detectedType: MeasurementType | null = null
        let skipped = 0
        // Igor .pxp imports primary plotted waves (X + Y), txt parses 2 columns.
        const pxps: File[] = []
        const txts: File[] = []
        for (const file of list) {
          if (/\.pxp$/i.test(file.name)) pxps.push(file)
          else txts.push(file)
        }
        const pxpResults = await Promise.all(pxps.map((file) => parsePxpFile(file)))
        for (const r of pxpResults) {
          all.push(...r.traces)
          skipped += r.skipped
          if (!detectedType && r.type) detectedType = r.type
        }
        if (txts.length > 0) all.push(...(await parseFiles(txts)))

        const usable = all.filter((t) => t.x.length > 0)
        if (usable.length === 0) {
          toast.error(t('analyze.fileReadFailed'))
          return
        }
        onTraces(usable)
        if (detectedType) onType?.(detectedType)
        toast.success(
          t('analyze.filesImported', { count: usable.length }) +
            (skipped > 0 ? t('analyze.filesSkipped', { count: skipped }) : ''),
        )
      } catch {
        toast.error(t('analyze.fileImportFailed'))
      } finally {
        setBusy(false)
      }
    },
    [onTraces, onType, t],
  )

  return (
    <FileDropzone
      className={className}
      label={t('analyze.fileDropLabel')}
      hint={t('analyze.fileDropHint')}
      accept=".txt,.pxp,text/plain"
      multiple
      busy={busy}
      onFiles={ingest}
    />
  )
}
