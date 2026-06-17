'use client'

import * as React from 'react'
import { Upload } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { parseFiles } from '../parse'
import type { Trace } from '../types'

export interface FileDropProps {
  onTraces: (traces: Trace[]) => void
  className?: string
}

export function FileDrop({ onTraces, className }: FileDropProps) {
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
        const traces = await parseFiles(list)
        const usable = traces.filter((t) => t.x.length > 0)
        if (usable.length === 0) {
          toast.error('数値データを読み取れませんでした')
          return
        }
        onTraces(usable)
        toast.success(`${usable.length} 件のスペクトルを読み込みました`)
      } catch {
        toast.error('ファイルの読み込みに失敗しました')
      } finally {
        setBusy(false)
      }
    },
    [onTraces],
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
          {busy ? '読み込み中…' : 'txt をドロップ / クリック'}
        </span>
        <span className="text-[10px] text-muted-foreground">.txt 複数可</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".txt,text/plain"
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
