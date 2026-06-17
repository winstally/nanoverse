'use client'

import { Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { NumberField } from '@/components/app/NumberField'
import { SectionLabel } from '@/components/app/SectionLabel'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  GridShape,
  LineSpaceShape,
  Shape,
  TextShape,
} from '@/modules/mask/shape'

interface InspectorProps {
  shape: Shape | null
  onUpdate: (id: string, patch: Partial<Shape>) => void
  onDelete: (id: string) => void
}

const KIND_LABEL: Record<Shape['kind'], string> = {
  rect: '矩形',
  ellipse: '楕円',
  text: '文字',
  lineSpace: 'ストライプ',
  grid: 'グリッド',
}

/**
 * Properties of the selected shape, edited in µm. Replaces the old right-hand
 * inspector — this now lives inside the single left panel's context section.
 */
export function Inspector({ shape, onUpdate, onDelete }: InspectorProps) {
  if (!shape) return null

  const set = (patch: Partial<Shape>) => onUpdate(shape.id, patch)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <SectionLabel>{KIND_LABEL[shape.kind]}</SectionLabel>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => onDelete(shape.id)}
          className="-mr-1 text-muted-foreground hover:text-destructive"
        >
          <Trash2 />
          削除
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <NumberField label="X" unit="µm" value={shape.x} onChange={(x) => set({ x })} />
        <NumberField label="Y" unit="µm" value={shape.y} onChange={(y) => set({ y })} />
      </div>

      {(shape.kind === 'rect' || shape.kind === 'ellipse') && (
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="幅 W"
            unit="µm"
            value={shape.w}
            min={0}
            onChange={(w) => set({ w: Math.max(0, w) })}
          />
          <NumberField
            label="高さ H"
            unit="µm"
            value={shape.h}
            min={0}
            onChange={(h) => set({ h: Math.max(0, h) })}
          />
        </div>
      )}

      {shape.kind === 'rect' && (
        <NumberField
          label="回転"
          unit="°"
          value={shape.rotationDeg ?? 0}
          step={1}
          onChange={(rotationDeg) => set({ rotationDeg })}
        />
      )}

      {shape.kind === 'text' && <TextFields shape={shape} set={set} />}
      {shape.kind === 'lineSpace' && <LineSpaceFields shape={shape} set={set} />}
      {shape.kind === 'grid' && <GridFields shape={shape} set={set} />}
    </div>
  )
}

function TextFields({
  shape,
  set,
}: {
  shape: TextShape
  set: (patch: Partial<Shape>) => void
}) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="shape-text" className="text-muted-foreground">
          内容
        </Label>
        <Input
          id="shape-text"
          value={shape.text}
          onChange={(e) => set({ text: e.target.value })}
        />
      </div>
      <NumberField
        label="文字高さ"
        unit="µm"
        value={shape.heightUm}
        min={0.1}
        onChange={(heightUm) => set({ heightUm: Math.max(0.1, heightUm) })}
      />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="shape-font" className="text-muted-foreground">
          フォント
        </Label>
        <Input
          id="shape-font"
          value={shape.fontFamily ?? ''}
          placeholder="sans-serif"
          onChange={(e) => set({ fontFamily: e.target.value || undefined })}
        />
      </div>
    </>
  )
}

function LineSpaceFields({
  shape,
  set,
}: {
  shape: LineSpaceShape
  set: (patch: Partial<Shape>) => void
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="線幅"
          unit="µm"
          value={shape.lineWidthUm}
          min={0.1}
          step={0.5}
          onChange={(lineWidthUm) => set({ lineWidthUm: Math.max(0.1, lineWidthUm) })}
        />
        <NumberField
          label="間隔"
          unit="µm"
          value={shape.spaceUm}
          min={0}
          step={0.5}
          onChange={(spaceUm) => set({ spaceUm: Math.max(0, spaceUm) })}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="本数"
          value={shape.count}
          min={1}
          step={1}
          onChange={(count) => set({ count: Math.max(1, Math.round(count)) })}
        />
        <NumberField
          label="長さ"
          unit="µm"
          value={shape.lengthUm}
          min={0.1}
          onChange={(lengthUm) => set({ lengthUm: Math.max(0.1, lengthUm) })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-muted-foreground">向き</Label>
        <ToggleGroup
          value={[shape.orientation === 'vertical' ? 'v' : 'h']}
          onValueChange={(next) => {
            const v = next[0]
            if (v) set({ orientation: v === 'v' ? 'vertical' : 'horizontal' })
          }}
          variant="outline"
          spacing={0}
          className="grid w-full grid-cols-2"
          aria-label="向き"
        >
          <ToggleGroupItem value="v" className="data-[state=on]:!bg-primary data-[state=on]:!text-primary-foreground">
            縦線
          </ToggleGroupItem>
          <ToggleGroupItem value="h" className="data-[state=on]:!bg-primary data-[state=on]:!text-primary-foreground">
            横線
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <NumberField
        label="回転"
        unit="°"
        value={shape.rotationDeg ?? 0}
        step={1}
        onChange={(rotationDeg) => set({ rotationDeg })}
      />
    </>
  )
}

function GridFields({
  shape,
  set,
}: {
  shape: GridShape
  set: (patch: Partial<Shape>) => void
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="線幅"
          unit="µm"
          value={shape.lineWidthUm}
          min={0.1}
          step={0.5}
          onChange={(lineWidthUm) => set({ lineWidthUm: Math.max(0.1, lineWidthUm) })}
        />
        <NumberField
          label="間隔"
          unit="µm"
          value={shape.spaceUm}
          min={0}
          step={0.5}
          onChange={(spaceUm) => set({ spaceUm: Math.max(0, spaceUm) })}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="列"
          value={shape.cols}
          min={1}
          step={1}
          onChange={(cols) => set({ cols: Math.max(1, Math.round(cols)) })}
        />
        <NumberField
          label="行"
          value={shape.rows}
          min={1}
          step={1}
          onChange={(rows) => set({ rows: Math.max(1, Math.round(rows)) })}
        />
      </div>
      <NumberField
        label="回転"
        unit="°"
        value={shape.rotationDeg ?? 0}
        step={1}
        onChange={(rotationDeg) => set({ rotationDeg })}
      />
    </>
  )
}
