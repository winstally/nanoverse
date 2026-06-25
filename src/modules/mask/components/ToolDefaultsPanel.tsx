'use client'

import { NumberField } from '@/components/app/NumberField'
import { SectionLabel } from '@/components/app/SectionLabel'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { MIN_UM } from '@/modules/mask/shape'
import type { DefaultableTool, ToolDefaults } from '@/modules/mask/tool-defaults'
import { MessageKey } from '@/lib/i18n'
import { useI18n } from '@/components/app/I18nProvider'

const KIND_LABEL_KEY: Record<DefaultableTool, MessageKey> = {
  rect: 'mask.tool.rect',
  ellipse: 'mask.tool.ellipse',
  line: 'mask.tool.line',
  text: 'mask.tool.text',
  lineSpace: 'mask.tool.lineSpace',
  grid: 'mask.tool.grid',
}

interface ToolDefaultsPanelProps {
  tool: DefaultableTool
  defaults: ToolDefaults
  onChange: (next: ToolDefaults) => void
}

/**
 * Default-size settings for the active creation tool. Shown in the panel's
 * context section while a creation tool is selected. A plain click on the canvas
 * places a shape at these dimensions (dragging still defines a custom size).
 */
export function ToolDefaultsPanel({ tool, defaults, onChange }: ToolDefaultsPanelProps) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col gap-3">
      <SectionLabel>
        {t('mask.defaultsTitle', { tool: t(KIND_LABEL_KEY[tool]) })}
      </SectionLabel>

      {tool === 'rect' && (
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label={t('mask.field.width')}
            unit="µm"
            value={defaults.rect.w}
            min={MIN_UM}
            onChange={(w) =>
              onChange({ ...defaults, rect: { ...defaults.rect, w: Math.max(MIN_UM, w) } })
            }
          />
          <NumberField
            label={t('mask.field.height')}
            unit="µm"
            value={defaults.rect.h}
            min={MIN_UM}
            onChange={(h) =>
              onChange({ ...defaults, rect: { ...defaults.rect, h: Math.max(MIN_UM, h) } })
            }
          />
        </div>
      )}

      {tool === 'ellipse' && (
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label={t('mask.field.width')}
            unit="µm"
            value={defaults.ellipse.w}
            min={MIN_UM}
            onChange={(w) =>
              onChange({ ...defaults, ellipse: { ...defaults.ellipse, w: Math.max(MIN_UM, w) } })
            }
          />
          <NumberField
            label={t('mask.field.height')}
            unit="µm"
            value={defaults.ellipse.h}
            min={MIN_UM}
            onChange={(h) =>
              onChange({ ...defaults, ellipse: { ...defaults.ellipse, h: Math.max(MIN_UM, h) } })
            }
          />
        </div>
      )}

      {tool === 'line' && (
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label={t('mask.field.length')}
            unit="µm"
            value={defaults.line.length}
            min={MIN_UM}
            onChange={(length) =>
              onChange({ ...defaults, line: { ...defaults.line, length: Math.max(MIN_UM, length) } })
            }
          />
          <NumberField
            label={t('mask.field.thickness')}
            unit="µm"
            value={defaults.line.thickness}
            min={MIN_UM}
            step={0.5}
            onChange={(thickness) =>
              onChange({
                ...defaults,
                line: { ...defaults.line, thickness: Math.max(MIN_UM, thickness) },
              })
            }
          />
        </div>
      )}

      {tool === 'text' && (
        <NumberField
          label={t('mask.field.textHeight')}
          unit="µm"
          value={defaults.text.heightUm}
          min={0.1}
          onChange={(heightUm) =>
            onChange({ ...defaults, text: { heightUm: Math.max(0.1, heightUm) } })
          }
        />
      )}

      {tool === 'lineSpace' && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label={t('mask.field.lineWidth')}
              unit="µm"
              value={defaults.lineSpace.lineWidthUm}
              min={0.1}
              step={0.5}
              onChange={(lineWidthUm) =>
                onChange({
                  ...defaults,
                  lineSpace: {
                    ...defaults.lineSpace,
                    lineWidthUm: Math.max(0.1, lineWidthUm),
                  },
                })
              }
            />
            <NumberField
              label={t('mask.field.space')}
              unit="µm"
              value={defaults.lineSpace.spaceUm}
              min={0}
              step={0.5}
              onChange={(spaceUm) =>
                onChange({
                  ...defaults,
                  lineSpace: {
                    ...defaults.lineSpace,
                    spaceUm: Math.max(0, spaceUm),
                  },
                })
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label={t('mask.field.count')}
              value={defaults.lineSpace.count}
              min={1}
              step={1}
              onChange={(count) =>
                onChange({
                  ...defaults,
                  lineSpace: {
                    ...defaults.lineSpace,
                    count: Math.max(1, Math.round(count)),
                  },
                })
              }
            />
            <NumberField
              label={t('mask.field.length')}
              unit="µm"
              value={defaults.lineSpace.lengthUm}
              min={0.1}
              onChange={(lengthUm) =>
                onChange({
                  ...defaults,
                  lineSpace: {
                    ...defaults.lineSpace,
                    lengthUm: Math.max(0.1, lengthUm),
                  },
                })
              }
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm text-muted-foreground">{t('mask.orientation')}</span>
            <ToggleGroup
              value={[defaults.lineSpace.orientation === 'vertical' ? 'v' : 'h']}
              onValueChange={(next) => {
                const v = next[0]
                if (!v) return
                onChange({
                  ...defaults,
                  lineSpace: {
                    ...defaults.lineSpace,
                    orientation: v === 'v' ? 'vertical' : 'horizontal',
                  },
                })
              }}
              variant="outline"
              spacing={0}
              className="grid w-full grid-cols-2"
              aria-label={t('mask.orientation')}
            >
              <ToggleGroupItem value="v" className="data-[state=on]:!bg-primary data-[state=on]:!text-primary-foreground">
                {t('mask.orientation.vertical')}
              </ToggleGroupItem>
              <ToggleGroupItem value="h" className="data-[state=on]:!bg-primary data-[state=on]:!text-primary-foreground">
                {t('mask.orientation.horizontal')}
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {t('mask.generator.pitch')}{' '}
            <span className="tnum text-foreground">{(defaults.lineSpace.lineWidthUm + defaults.lineSpace.spaceUm).toFixed(1)}</span> µm
          </p>
        </>
      )}

      {tool === 'grid' && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label={t('mask.field.lineWidth')}
              unit="µm"
              value={defaults.grid.lineWidthUm}
              min={0.1}
              step={0.5}
              onChange={(lineWidthUm) =>
                onChange({
                  ...defaults,
                  grid: {
                    ...defaults.grid,
                    lineWidthUm: Math.max(0.1, lineWidthUm),
                  },
                })
              }
            />
            <NumberField
              label={t('mask.field.space')}
              unit="µm"
              value={defaults.grid.spaceUm}
              min={0}
              step={0.5}
              onChange={(spaceUm) =>
                onChange({
                  ...defaults,
                  grid: {
                    ...defaults.grid,
                    spaceUm: Math.max(0, spaceUm),
                  },
                })
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label={t('mask.field.cols')}
              value={defaults.grid.cols}
              min={1}
              step={1}
              onChange={(cols) =>
                onChange({
                  ...defaults,
                  grid: { ...defaults.grid, cols: Math.max(1, Math.round(cols)) },
                })
              }
            />
            <NumberField
              label={t('mask.field.rows')}
              value={defaults.grid.rows}
              min={1}
              step={1}
              onChange={(rows) =>
                onChange({
                  ...defaults,
                  grid: { ...defaults.grid, rows: Math.max(1, Math.round(rows)) },
                })
              }
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            {t('mask.generator.pitch')}{' '}
            <span className="tnum text-foreground">{(defaults.grid.lineWidthUm + defaults.grid.spaceUm).toFixed(1)}</span> µm
          </p>
        </>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        {t('mask.defaultHint')}
      </p>
    </div>
  )
}
