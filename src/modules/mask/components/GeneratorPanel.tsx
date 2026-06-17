'use client'

import { useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NumberField } from '@/components/app/NumberField'
import { SectionLabel } from '@/components/app/SectionLabel'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  GridShape,
  LineSpaceShape,
  newId,
  Shape,
} from '@/modules/mask/shape'

type GeneratorKind = 'lineSpace' | 'grid'

interface GeneratorPanelProps {
  kind: GeneratorKind
  onAdd: (shape: Shape) => void
}

export function GeneratorPanel({ kind, onAdd }: GeneratorPanelProps) {
  return kind === 'lineSpace' ? (
    <StripeForm onAdd={onAdd} />
  ) : (
    <GridForm onAdd={onAdd} />
  )
}

function StripeForm({ onAdd }: { onAdd: (s: Shape) => void }) {
  const [lineWidthUm, setLine] = useState(5)
  const [spaceUm, setSpace] = useState(5)
  const [count, setCount] = useState(10)
  const [lengthUm, setLength] = useState(50)
  const [vertical, setVertical] = useState(true)
  const drop = useDrop()

  const add = () => {
    const [x, y] = drop()
    const shape: LineSpaceShape = {
      id: newId('ls-'),
      kind: 'lineSpace',
      x,
      y,
      lineWidthUm: Math.max(0.1, lineWidthUm),
      spaceUm: Math.max(0, spaceUm),
      count: Math.max(1, Math.round(count)),
      orientation: vertical ? 'vertical' : 'horizontal',
      lengthUm: Math.max(0.1, lengthUm),
    }
    onAdd(shape)
  }

  return (
    <Section title="ストライプ" pitch={lineWidthUm + spaceUm} onAdd={add}>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="線幅" unit="µm" value={lineWidthUm} step={0.5} min={0.1} onChange={setLine} />
        <NumberField label="間隔" unit="µm" value={spaceUm} step={0.5} min={0} onChange={setSpace} />
        <NumberField label="本数" value={count} step={1} min={1} onChange={setCount} />
        <NumberField label="長さ" unit="µm" value={lengthUm} step={1} min={0.1} onChange={setLength} />
      </div>
      <OrientationToggle vertical={vertical} onChange={setVertical} />
    </Section>
  )
}

function GridForm({ onAdd }: { onAdd: (s: Shape) => void }) {
  const [lineWidthUm, setLine] = useState(5)
  const [spaceUm, setSpace] = useState(10)
  const [cols, setCols] = useState(6)
  const [rows, setRows] = useState(6)
  const drop = useDrop()

  const add = () => {
    const [x, y] = drop()
    const shape: GridShape = {
      id: newId('grid-'),
      kind: 'grid',
      x,
      y,
      lineWidthUm: Math.max(0.1, lineWidthUm),
      spaceUm: Math.max(0, spaceUm),
      cols: Math.max(1, Math.round(cols)),
      rows: Math.max(1, Math.round(rows)),
    }
    onAdd(shape)
  }

  return (
    <Section title="グリッド" pitch={lineWidthUm + spaceUm} onAdd={add}>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="線幅" unit="µm" value={lineWidthUm} step={0.5} min={0.1} onChange={setLine} />
        <NumberField label="間隔" unit="µm" value={spaceUm} step={0.5} min={0} onChange={setSpace} />
        <NumberField label="列" value={cols} step={1} min={1} onChange={setCols} />
        <NumberField label="行" value={rows} step={1} min={1} onChange={setRows} />
      </div>
    </Section>
  )
}

function OrientationToggle({
  vertical,
  onChange,
}: {
  vertical: boolean
  onChange: (vertical: boolean) => void
}) {
  return (
    <ToggleGroup
      value={[vertical ? 'v' : 'h']}
      onValueChange={(next) => {
        const v = next[0]
        if (v) onChange(v === 'v')
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
  )
}

/** Cascading drop position so repeated adds don't stack exactly. */
function useDrop(): () => [number, number] {
  const n = useRef(0)
  return () => {
    const k = n.current % 8
    n.current += 1
    return [20 + k * 6, 20 + k * 6]
  }
}

function Section({
  title,
  pitch,
  onAdd,
  children,
}: {
  title: string
  pitch: number
  onAdd: () => void
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <SectionLabel>{title}</SectionLabel>
        <span className="text-[11px] text-muted-foreground">
          ピッチ <span className="tnum text-foreground">{pitch.toFixed(1)}</span> µm
        </span>
      </div>
      {children}
      <Button onClick={onAdd} variant="secondary" className="w-full">
        <Plus />
        追加
      </Button>
    </div>
  )
}
