'use client'

import * as React from 'react'
import { Reorder, useDragControls, useReducedMotion } from 'motion/react'
import { Eye, EyeOff, Trash2, GripVertical } from 'lucide-react'
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
  /** New order after a drag / keyboard move. Order = legend, z-order, fit target. */
  onReorder: (traces: Trace[]) => void
  onRename: (id: string, name: string) => void
  onToggle: (id: string) => void
  onRemove: (id: string) => void
  onColor: (id: string, color: string) => void
  onLineWidth: (id: string, width: number) => void
  className?: string
}

// Match the app's spring (photoverse layout) so reorder motion is consistent.
const SPRING = { type: 'spring', stiffness: 420, damping: 30, mass: 1 } as const

function TraceRow({
  trace,
  index,
  count,
  reduceMotion,
  onRename,
  onToggle,
  onRemove,
  onColor,
  onLineWidth,
  onMove,
}: {
  trace: Trace
  index: number
  count: number
  reduceMotion: boolean
  onRename: (id: string, name: string) => void
  onToggle: (id: string) => void
  onRemove: (id: string) => void
  onColor: (id: string, color: string) => void
  onLineWidth: (id: string, width: number) => void
  onMove: (index: number, dir: -1 | 1) => void
}) {
  const lw = trace.lineWidth ?? DEFAULT_LINE_WIDTH
  const controls = useDragControls()

  return (
    <Reorder.Item
      value={trace}
      dragListener={false}
      dragControls={controls}
      transition={reduceMotion ? { duration: 0 } : SPRING}
      whileDrag={{
        scale: 1.01,
        backgroundColor: 'var(--muted)',
        boxShadow: '0 10px 28px -12px rgba(20,23,28,0.28)',
      }}
      // touch-none on the whole row: motion only auto-sets touch-action on a
      // draggable item when dragListener isn't false, so without this a touch
      // drag drifting off the small handle is stolen by the panel's scroll.
      className="group relative flex touch-none items-center gap-1 rounded-md px-1 py-1 transition-colors hover:bg-muted"
    >
      {/* Drag handle — drag starts only here, so inputs/switch stay usable.
          Arrow keys move the row for keyboard users. */}
      <button
        type="button"
        onPointerDown={(e) => controls.start(e)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') {
            e.preventDefault()
            onMove(index, -1)
          } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            onMove(index, 1)
          }
        }}
        aria-label={`並べ替え（${index + 1} / ${count}）。上下キーで移動`}
        className="flex shrink-0 cursor-grab touch-none rounded-sm p-0.5 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground/70 hover:!text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:cursor-grabbing"
      >
        <GripVertical size={14} aria-hidden />
      </button>

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
    </Reorder.Item>
  )
}

export function TraceList({
  traces,
  onReorder,
  onRename,
  onToggle,
  onRemove,
  onColor,
  onLineWidth,
  className,
}: TraceListProps) {
  const reduceMotion = useReducedMotion() ?? false
  // Screen-reader feedback for keyboard reordering (handle has no visible label).
  const [liveMsg, setLiveMsg] = React.useState('')

  const move = React.useCallback(
    (index: number, dir: -1 | 1) => {
      const j = index + dir
      if (j < 0 || j >= traces.length) {
        setLiveMsg('これ以上移動できません')
        return
      }
      const next = traces.slice()
      ;[next[index], next[j]] = [next[j], next[index]]
      setLiveMsg(`${traces[index].name} を ${j + 1} / ${traces.length} に移動`)
      onReorder(next)
    },
    [traces, onReorder],
  )

  if (traces.length === 0) return null

  return (
    <>
      <Reorder.Group
        as="ul"
        axis="y"
        values={traces}
        onReorder={onReorder}
        className={cn('flex flex-col gap-0.5', className)}
      >
        {traces.map((t, i) => (
          <TraceRow
            key={t.id}
            trace={t}
            index={i}
            count={traces.length}
            reduceMotion={reduceMotion}
            onRename={onRename}
            onToggle={onToggle}
            onRemove={onRemove}
            onColor={onColor}
            onLineWidth={onLineWidth}
            onMove={move}
          />
        ))}
      </Reorder.Group>
      <div aria-live="polite" role="status" className="sr-only">
        {liveMsg}
      </div>
    </>
  )
}
