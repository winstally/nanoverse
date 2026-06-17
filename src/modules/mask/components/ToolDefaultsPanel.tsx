'use client'

import { NumberField } from '@/components/app/NumberField'
import { SectionLabel } from '@/components/app/SectionLabel'
import { MIN_UM } from '@/modules/mask/shape'
import type { DefaultableTool, ToolDefaults } from '@/modules/mask/tool-defaults'

const KIND_LABEL: Record<DefaultableTool, string> = {
  rect: '矩形',
  ellipse: '楕円',
  line: '線',
  text: '文字',
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
  return (
    <div className="flex flex-col gap-3">
      <SectionLabel>{KIND_LABEL[tool]}の既定サイズ</SectionLabel>

      {tool === 'rect' && (
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="幅 W"
            unit="µm"
            value={defaults.rect.w}
            min={MIN_UM}
            onChange={(w) =>
              onChange({ ...defaults, rect: { ...defaults.rect, w: Math.max(MIN_UM, w) } })
            }
          />
          <NumberField
            label="高さ H"
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
            label="幅 W"
            unit="µm"
            value={defaults.ellipse.w}
            min={MIN_UM}
            onChange={(w) =>
              onChange({ ...defaults, ellipse: { ...defaults.ellipse, w: Math.max(MIN_UM, w) } })
            }
          />
          <NumberField
            label="高さ H"
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
            label="長さ"
            unit="µm"
            value={defaults.line.length}
            min={MIN_UM}
            onChange={(length) =>
              onChange({ ...defaults, line: { ...defaults.line, length: Math.max(MIN_UM, length) } })
            }
          />
          <NumberField
            label="太さ"
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
          label="文字高さ"
          unit="µm"
          value={defaults.text.heightUm}
          min={0.1}
          onChange={(heightUm) =>
            onChange({ ...defaults, text: { heightUm: Math.max(0.1, heightUm) } })
          }
        />
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        キャンバスをクリックするとこのサイズで配置されます。ドラッグすれば任意のサイズで描けます。
      </p>
    </div>
  )
}
