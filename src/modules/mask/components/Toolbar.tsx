'use client'

import {
  MousePointer2,
  Square,
  Minus,
  Circle,
  Type,
  AlignJustify,
  Grid3x3,
} from 'lucide-react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export type ToolKind =
  | 'select'
  | 'rect'
  | 'line'
  | 'ellipse'
  | 'text'
  | 'lineSpace'
  | 'grid'

interface ToolDef {
  kind: ToolKind
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const TOOLS: ToolDef[] = [
  { kind: 'select', label: '選択', icon: MousePointer2 },
  { kind: 'rect', label: '矩形', icon: Square },
  { kind: 'ellipse', label: '楕円', icon: Circle },
  { kind: 'line', label: '線', icon: Minus },
  { kind: 'text', label: '文字', icon: Type },
  { kind: 'lineSpace', label: 'ストライプ', icon: AlignJustify },
  { kind: 'grid', label: 'グリッド', icon: Grid3x3 },
]

interface ToolbarProps {
  tool: ToolKind
  onToolChange: (tool: ToolKind) => void
}

/**
 * Tool picker — a single-select shadcn ToggleGroup. Each tool is an icon button
 * with its Japanese label in a tooltip. Selecting an empty group is ignored so
 * one tool is always active.
 */
export function Toolbar({ tool, onToolChange }: ToolbarProps) {
  return (
    <ToggleGroup
      value={[tool]}
      onValueChange={(next) => {
        const v = next[0] as ToolKind | undefined
        if (v) onToolChange(v)
      }}
      variant="outline"
      spacing={0}
      className="grid w-full grid-cols-7"
      aria-label="ツール"
    >
      {TOOLS.map(({ kind, label, icon: Icon }) => (
        <Tooltip key={kind}>
          <TooltipTrigger
            render={
              <ToggleGroupItem
                value={kind}
                aria-label={label}
                className="data-[state=on]:!bg-primary data-[state=on]:!text-primary-foreground"
              >
                <Icon className="size-4" />
              </ToggleGroupItem>
            }
          />
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      ))}
    </ToggleGroup>
  )
}
