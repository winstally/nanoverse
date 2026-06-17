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
}

export const DEFAULT_TOOL_DEFAULTS: ToolDefaults = {
  rect: { w: 50, h: 50 },
  ellipse: { w: 50, h: 50 },
  line: { length: 50, thickness: 1 },
  text: { heightUm: 20 },
}

/** Tools whose default size is user-configurable / click-placeable. */
export type DefaultableTool = 'rect' | 'ellipse' | 'line' | 'text'

export function isDefaultableTool(tool: ToolKind): tool is DefaultableTool {
  return tool === 'rect' || tool === 'ellipse' || tool === 'line' || tool === 'text'
}
