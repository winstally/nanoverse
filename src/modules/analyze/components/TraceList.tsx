'use client'

import * as React from 'react'
import { Eye, EyeOff, Trash2, LineChart } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { DEFAULT_LINE_WIDTH, type Trace } from '../types'

export interface TraceListProps {
  traces: Trace[]
  onRename: (id: string, name: string) => void
  onToggle: (id: string) => void
  onRemove: (id: string) => void
  onColor: (id: string, color: string) => void
  onLineWidth: (id: string, width: number) => void
  className?: string
}

function TraceRow({
  trace,
  onRename,
  onToggle,
  onRemove,
  onColor,
  onLineWidth,
}: {
  trace: Trace
  onRename: (id: string, name: string) => void
  onToggle: (id: string) => void
  onRemove: (id: string) => void
  onColor: (id: string, color: string) => void
  onLineWidth: (id: string, width: number) => void
}) {
  const lw = trace.lineWidth ?? DEFAULT_LINE_WIDTH

  return (
    <li className="flex items-center gap-1.5 rounded-md px-1 py-1 transition-colors hover:bg-muted">
      {/* Color + line-width popover */}
      <Popover>
        <PopoverTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="色と線幅を編集"
              className="shrink-0"
            />
          }
        >
          <span
            className="size-3.5 rounded-sm border border-border"
            style={{ backgroundColor: trace.color }}
            aria-hidden
          />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={`color-${trace.id}`} className="text-xs">
              色
            </Label>
            <input
              id={`color-${trace.id}`}
              type="color"
              value={trace.color}
              onChange={(e) => onColor(trace.id, e.target.value)}
              className="h-7 w-12 cursor-pointer rounded-sm border border-border bg-transparent p-0.5"
              aria-label="色"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">線幅</Label>
              <span className="tnum text-xs text-muted-foreground">
                {lw.toFixed(1)}
              </span>
            </div>
            <Slider
              value={lw}
              min={0.5}
              max={5}
              step={0.5}
              onValueChange={(v) => {
                const next = Array.isArray(v) ? v[0] : v
                if (Number.isFinite(next)) onLineWidth(trace.id, next)
              }}
              aria-label="線幅"
            />
          </div>
        </PopoverContent>
      </Popover>

      {/* Editable label */}
      <Input
        value={trace.name}
        onChange={(e) => onRename(trace.id, e.target.value)}
        className="h-7 flex-1 px-2 text-xs"
        aria-label="凡例ラベル"
      />

      {/* Visibility */}
      <span
        className="inline-flex shrink-0 items-center gap-1"
        title={trace.visible ? '表示中' : '非表示'}
      >
        {trace.visible ? (
          <Eye size={13} className="text-muted-foreground" aria-hidden />
        ) : (
          <EyeOff size={13} className="text-muted-foreground/60" aria-hidden />
        )}
        <Switch
          checked={trace.visible}
          onCheckedChange={() => onToggle(trace.id)}
          size="sm"
          aria-label={trace.visible ? '非表示にする' : '表示する'}
        />
      </span>

      {/* Remove */}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => onRemove(trace.id)}
        aria-label="トレースを削除"
        className="shrink-0 text-muted-foreground hover:text-destructive"
      >
        <Trash2 />
      </Button>
    </li>
  )
}

export function TraceList({
  traces,
  onRename,
  onToggle,
  onRemove,
  onColor,
  onLineWidth,
  className,
}: TraceListProps) {
  if (traces.length === 0) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center gap-2 py-8 text-center',
          className,
        )}
      >
        <LineChart size={22} className="text-muted-foreground" aria-hidden />
        <p className="text-xs text-muted-foreground">
          まだスペクトルがありません
        </p>
      </div>
    )
  }

  return (
    <ul className={cn('flex flex-col gap-0.5', className)}>
      {traces.map((t) => (
        <TraceRow
          key={t.id}
          trace={t}
          onRename={onRename}
          onToggle={onToggle}
          onRemove={onRemove}
          onColor={onColor}
          onLineWidth={onLineWidth}
        />
      ))}
    </ul>
  )
}
