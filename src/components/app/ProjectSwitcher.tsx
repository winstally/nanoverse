'use client'

import * as React from 'react'
import { FolderOpen, Plus, Trash2, Check } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import type { AutosaveStatus } from '@/hooks/use-autosave'

export interface ProjectSwitcherItem {
  id: string
  name: string
}

export interface ProjectSwitcherProps {
  items: ProjectSwitcherItem[]
  currentId: string | null
  currentName: string
  onRename: (name: string) => void
  onSelect: (id: string) => void
  onCreateNew: () => void
  onDelete: (id: string) => void
  status?: AutosaveStatus
  className?: string
}

const STATUS_LABEL: Record<AutosaveStatus, string> = {
  idle: '',
  saving: '保存中…',
  saved: '保存済み',
  error: '保存に失敗',
}

/**
 * Top-of-tool project control. A plain text input renames the current project
 * (autosaved); a popover lists saved projects to load, with new / delete.
 */
export function ProjectSwitcher({
  items,
  currentId,
  currentName,
  onRename,
  onSelect,
  onCreateNew,
  onDelete,
  status = 'idle',
  className,
}: ProjectSwitcherProps) {
  const [open, setOpen] = React.useState(false)
  const statusText = STATUS_LABEL[status]

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <Input
        value={currentName}
        onChange={(e) => onRename(e.target.value)}
        placeholder="プロジェクト名"
        aria-label="プロジェクト名"
        className="min-w-0 flex-1"
      />

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              size="icon"
              aria-label="プロジェクトを開く"
              className="shrink-0"
            >
              <FolderOpen />
            </Button>
          }
        />
        <PopoverContent align="end" className="w-64 p-1">
          <div className="max-h-64 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                保存済みプロジェクトはありません
              </p>
            ) : (
              items.map((item) => {
                const active = item.id === currentId
                return (
                  <div
                    key={item.id}
                    className={cn(
                      'group flex items-center gap-1 rounded-md pr-1 hover:bg-muted',
                      active && 'bg-muted/60',
                    )}
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm outline-hidden"
                      onClick={() => {
                        onSelect(item.id)
                        setOpen(false)
                      }}
                    >
                      <Check
                        className={cn(
                          'size-3.5 shrink-0',
                          active ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      <span className="truncate">{item.name}</span>
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`${item.name} を削除`}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => onDelete(item.id)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                )
              })
            )}
          </div>
          <Separator className="my-1" />
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground outline-hidden select-none hover:bg-muted hover:text-foreground"
            onClick={() => {
              onCreateNew()
              setOpen(false)
            }}
          >
            <Plus className="size-4" />
            新規作成
          </button>
        </PopoverContent>
      </Popover>

      {statusText && (
        <span
          className={cn(
            'shrink-0 text-xs whitespace-nowrap',
            status === 'error' ? 'text-destructive' : 'text-muted-foreground',
          )}
          aria-live="polite"
        >
          {statusText}
        </span>
      )}
    </div>
  )
}
