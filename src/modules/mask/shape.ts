export type ShapeKind = 'rect' | 'ellipse' | 'text' | 'lineSpace' | 'grid'

/** Smallest dimension (µm) any shape may have, to keep it selectable/visible. */
export const MIN_UM = 0.5

export interface RectShape {
  id: string
  kind: 'rect'
  x: number
  y: number
  w: number
  h: number
  rotationDeg?: number
}

export interface EllipseShape {
  id: string
  kind: 'ellipse'
  x: number
  y: number
  w: number
  h: number
} // x,y,w,h = bounding box

export interface TextShape {
  id: string
  kind: 'text'
  x: number
  y: number
  text: string
  heightUm: number
  fontFamily?: string
}

export interface LineSpaceShape {
  id: string
  kind: 'lineSpace'
  x: number
  y: number
  lineWidthUm: number
  spaceUm: number
  count: number
  orientation: 'horizontal' | 'vertical'
  lengthUm: number
  rotationDeg?: number
}

export interface GridShape {
  id: string
  kind: 'grid'
  x: number
  y: number
  lineWidthUm: number
  spaceUm: number
  cols: number // vertical lines
  rows: number // horizontal lines
  rotationDeg?: number
}

export type Shape =
  | RectShape
  | EllipseShape
  | TextShape
  | LineSpaceShape
  | GridShape

let idCounter = 0

export function newId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return prefix + crypto.randomUUID()
  }
  idCounter += 1
  return prefix + Date.now().toString(36) + '-' + idCounter.toString(36)
}
