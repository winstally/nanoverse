'use client'

import * as React from 'react'
import { Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/components/app/I18nProvider'

export interface FileDropzoneProps {
  label: string
  hint: string
  accept?: string
  multiple?: boolean
  busy?: boolean
  busyLabel?: string
  className?: string
  onFiles: (files: File[]) => void | Promise<void>
}

export function FileDropzone({
  label,
  hint,
  accept,
  multiple = false,
  busy = false,
  busyLabel,
  className,
  onFiles,
}: FileDropzoneProps) {
  const { t } = useI18n()
  const [dragging, setDragging] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const ingest = React.useCallback(
    (files: FileList | File[] | null) => {
      if (!files || busy) return
      const list = Array.from(files)
      if (list.length === 0) return
      void onFiles(multiple ? list : list.slice(0, 1))
    },
    [busy, multiple, onFiles],
  )

  return (
    <div className={className}>
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          if (!busy) setDragging(true)
        }}
        onDragLeave={(e) => {
          e.preventDefault()
          setDragging(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          ingest(e.dataTransfer.files)
        }}
        className={cn(
          'flex w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed px-3 py-6 text-center transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-70',
          dragging
            ? 'border-primary bg-muted'
            : 'border-border bg-card hover:bg-muted',
        )}
      >
        <Upload size={20} className="text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          {busy ? busyLabel || t('common.loading') : label}
        </span>
        <span className="text-[10px] text-muted-foreground">{hint}</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        aria-label={label}
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          ingest(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}
