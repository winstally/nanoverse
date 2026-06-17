'use client'

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxSeparator,
} from '@/components/ui/combobox'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { AutosaveStatus } from '@/hooks/use-autosave'
import { Plus, Trash2 } from 'lucide-react'

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
 * Top-of-tool project switcher. The input shows/edits the current project name
 * (typing renames it). The dropdown lists saved projects to load, offers a
 * "新規作成" action, and a delete affordance per item. A subtle autosave status
 * sits beside it.
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
  const statusText = STATUS_LABEL[status]

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Combobox
        items={items}
        // Static list: do not filter by the typed name (the input is for renaming).
        filter={null}
        // We don't bind a selected value; selection is handled via onValueChange.
        value={null}
        onValueChange={(next) => {
          if (next && next.id !== currentId) {
            onSelect(next.id)
          }
        }}
        // The input value is the current project name; editing it renames.
        inputValue={currentName}
        onInputValueChange={(text) => onRename(text)}
        itemToStringLabel={(item: ProjectSwitcherItem) => item?.name ?? ''}
      >
        <ComboboxInput
          className="w-56"
          placeholder="プロジェクト名"
          aria-label="プロジェクト名"
        >
          <ComboboxContent>
            <ComboboxEmpty>保存済みプロジェクトはありません</ComboboxEmpty>
            <ComboboxList>
              {(item: ProjectSwitcherItem) => (
                <ComboboxItem
                  key={item.id}
                  value={item}
                  className={cn(
                    'pr-2',
                    item.id === currentId && 'font-medium'
                  )}
                >
                  <span className="flex-1 truncate">{item.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`${item.name} を削除`}
                    className="ml-1 text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation()
                      e.preventDefault()
                      onDelete(item.id)
                    }}
                  >
                    <Trash2 />
                  </Button>
                </ComboboxItem>
              )}
            </ComboboxList>
            <ComboboxSeparator />
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md py-1 pr-8 pl-1.5 text-sm text-muted-foreground outline-hidden select-none hover:bg-accent hover:text-accent-foreground"
              onClick={() => onCreateNew()}
            >
              <Plus className="size-4" />
              <span>新規作成</span>
            </button>
          </ComboboxContent>
        </ComboboxInput>
      </Combobox>

      {statusText && (
        <span
          className={cn(
            'text-xs whitespace-nowrap',
            status === 'error' ? 'text-destructive' : 'text-muted-foreground'
          )}
          aria-live="polite"
        >
          {statusText}
        </span>
      )}
    </div>
  )
}
