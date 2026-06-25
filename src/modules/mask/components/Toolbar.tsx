'use client'

import {
  MousePointer2,
  Square,
  Minus,
  Circle,
  Type,
  AlignJustify,
  Grid3x3,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { MessageKey } from '@/lib/i18n'
import { useI18n } from '@/components/app/I18nProvider'

export type ToolKind =
  | 'select'
  | 'rect'
  | 'line'
  | 'ellipse'
  | 'text'
  | 'lineSpace'
  | 'grid'
  | 'zoomIn'
  | 'zoomOut'

interface ToolDef {
  kind: ToolKind
  labelKey: MessageKey
  icon: React.ComponentType<{ className?: string }>
}

const OPERATION_TOOLS: ToolDef[] = [
  { kind: 'select', labelKey: 'mask.tool.select', icon: MousePointer2 },
  { kind: 'zoomIn', labelKey: 'mask.zoomIn', icon: ZoomIn },
  { kind: 'zoomOut', labelKey: 'mask.zoomOut', icon: ZoomOut },
]

const DRAWING_TOOLS: ToolDef[] = [
  { kind: 'rect', labelKey: 'mask.tool.rect', icon: Square },
  { kind: 'ellipse', labelKey: 'mask.tool.ellipse', icon: Circle },
  { kind: 'line', labelKey: 'mask.tool.line', icon: Minus },
  { kind: 'text', labelKey: 'mask.tool.text', icon: Type },
  { kind: 'lineSpace', labelKey: 'mask.tool.lineSpace', icon: AlignJustify },
  { kind: 'grid', labelKey: 'mask.tool.grid', icon: Grid3x3 },
]

interface ToolbarProps {
  tool: ToolKind
  onToolChange: (tool: ToolKind) => void
  onZoomFit: () => void
}

/**
 * Tool picker — a single-select shadcn ToggleGroup. Each tool is an icon button
 * with its Japanese label in a tooltip. Selecting an empty group is ignored so
 * one tool is always active.
 */
export function Toolbar({ tool, onToolChange, onZoomFit }: ToolbarProps) {
  const { t } = useI18n()
  const zoomFitLabel = t('mask.zoomFit')
  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        <span className="px-0.5 text-sm font-medium text-muted-foreground">
          {t('mask.operation')}
        </span>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <ToolGroup
            tools={OPERATION_TOOLS}
            columns={3}
            label={t('mask.operationTools')}
            tool={tool}
            onToolChange={onToolChange}
          />
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={zoomFitLabel}
                  onClick={onZoomFit}
                >
                  <Maximize2 />
                </Button>
              }
            />
            <TooltipContent>{zoomFitLabel}</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <div className="grid gap-2">
        <span className="px-0.5 text-sm font-medium text-muted-foreground">
          {t('mask.drawing')}
        </span>
        <ToolGroup
          tools={DRAWING_TOOLS}
          columns={6}
          label={t('mask.drawingTools')}
          tool={tool}
          onToolChange={onToolChange}
        />
      </div>
    </div>
  )
}

function ToolGroup({
  tools,
  columns,
  label,
  tool,
  onToolChange,
}: {
  tools: ToolDef[]
  columns: 3 | 6
  label: string
  tool: ToolKind
  onToolChange: (tool: ToolKind) => void
}) {
  return (
    <ToggleGroup
      value={[tool]}
      onValueChange={(next) => {
        const v = next[0] as ToolKind | undefined
        if (v) onToolChange(v)
      }}
      variant="outline"
      spacing={0}
      className={columns === 3 ? 'grid w-full grid-cols-3' : 'grid w-full grid-cols-6'}
      aria-label={label}
    >
      {tools.map(({ kind, labelKey, icon: Icon }) => (
        <ToolButton key={kind} kind={kind} labelKey={labelKey} icon={Icon} />
      ))}
    </ToggleGroup>
  )
}

function ToolButton({
  kind,
  labelKey,
  icon: Icon,
}: ToolDef) {
  const { t } = useI18n()
  const label = t(labelKey)
  return (
    <Tooltip>
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
  )
}
