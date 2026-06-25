import type { ToolKind } from '@/modules/mask/components/Toolbar'

/**
 * Default dimensions (µm) used when a creation tool is clicked without dragging.
 * Dragging still defines a custom size; a plain click places a shape at this
 * size, centred on the click point.
 */
export interface ToolDefaults {
  rect: { w: number; h: number }
  ellipse: { w: number; h: number }
  line: { length: number; thickness: number }
  text: { heightUm: number }
  lineSpace: {
    lineWidthUm: number
    spaceUm: number
    count: number
    lengthUm: number
    orientation: 'horizontal' | 'vertical'
  }
  grid: {
    lineWidthUm: number
    spaceUm: number
    cols: number
    rows: number
  }
}

export const DEFAULT_TOOL_DEFAULTS: ToolDefaults = {
  rect: { w: 50, h: 50 },
  ellipse: { w: 50, h: 50 },
  line: { length: 50, thickness: 1 },
  text: { heightUm: 20 },
  lineSpace: {
    lineWidthUm: 5,
    spaceUm: 5,
    count: 10,
    lengthUm: 50,
    orientation: 'vertical',
  },
  grid: {
    lineWidthUm: 5,
    spaceUm: 10,
    cols: 6,
    rows: 6,
  },
}

/** Tools whose default size is user-configurable / click-placeable. */
export type DefaultableTool =
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'text'
  | 'lineSpace'
  | 'grid'

export function isDefaultableTool(tool: ToolKind): tool is DefaultableTool {
  return (
    tool === 'rect' ||
    tool === 'ellipse' ||
    tool === 'line' ||
    tool === 'text' ||
    tool === 'lineSpace' ||
    tool === 'grid'
  )
}
