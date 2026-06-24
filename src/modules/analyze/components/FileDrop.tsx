'use client'

import * as React from 'react'
import { Upload } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
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
  const [dragging, setDragging] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const ingest = React.useCallback(
    async (files: FileList | File[] | null) => {
      if (!files) return
      const list = Array.from(files)
      if (list.length === 0) return
      setBusy(true)
      try {
        const all: Trace[] = []
        let detectedType: MeasurementType | null = null
        let skipped = 0
        // Igor .pxp imports the measured data waves (X + Y), txt parses 2 columns.
        for (const f of list.filter((f) => /\.pxp$/i.test(f.name))) {
          const r = await parsePxpFile(f)
          all.push(...r.traces)
          skipped += r.skipped
          if (!detectedType && r.type) detectedType = r.type
        }
        const txts = list.filter((f) => !/\.pxp$/i.test(f.name))
        if (txts.length > 0) all.push(...(await parseFiles(txts)))

        const usable = all.filter((t) => t.x.length > 0)
        if (usable.length === 0) {
          toast.error('データを読み取れませんでした')
          return
        }
        onTraces(usable)
        if (detectedType) onType?.(detectedType)
        toast.success(
          `${usable.length} 件のスペクトルを読み込みました` +
            (skipped > 0 ? `（${skipped} 件はX軸不一致でスキップ）` : ''),
        )
      } catch {
        toast.error('ファイルの読み込みに失敗しました')
      } finally {
        setBusy(false)
      }
    },
    [onTraces, onType],
  )

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={(e) => {
          e.preventDefault()
          setDragging(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          void ingest(e.dataTransfer.files)
        }}
        className={cn(
          'flex w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed px-3 py-6 text-center transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
          dragging
            ? 'border-primary bg-muted'
            : 'border-border bg-card hover:bg-muted',
        )}
      >
        <Upload size={20} className="text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          {busy ? '読み込み中…' : 'txt / pxp をドロップ / クリック'}
        </span>
        <span className="text-[10px] text-muted-foreground">
          .txt / Igor .pxp 複数可
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".txt,.pxp,text/plain"
        multiple
        className="hidden"
        onChange={(e) => {
          void ingest(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}
