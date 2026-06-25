import { MIN_UM, Shape } from './shape'

export interface Point {
  x: number
  y: number
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface RectPrimitive extends Box {
  rotationDeg?: number
  rotationOrigin?: Point
  flipX?: boolean
  flipY?: boolean
}

export type CornerHandle = 'nw' | 'ne' | 'se' | 'sw'

export const MIN_LINE_UM = 0.1

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi)
}

function normalizeRotation(rotationDeg: number): number {
  const normalized = ((rotationDeg % 360) + 360) % 360
  return normalized > 180 ? normalized - 360 : normalized
}

export function patternSpan(
  count: number,
  lineWidthUm: number,
  spaceUm: number,
): number {
  const c = Math.max(1, Math.round(count))
  return c * lineWidthUm + Math.max(0, c - 1) * spaceUm
}

export function countForSpan(
  spanUm: number,
  lineWidthUm: number,
  spaceUm: number,
): number {
  const line = Math.max(MIN_LINE_UM, lineWidthUm)
  const space = Math.max(0, spaceUm)
  const pitch = line + space
  return Math.max(1, Math.round((Math.max(spanUm, line) + space) / pitch))
}

export function shapeRotationDeg(shape: Shape): number {
  return shape.rotationDeg ?? 0
}

export function shapeFlipX(shape: Shape): boolean {
  return shape.flipX ?? false
}

export function shapeFlipY(shape: Shape): boolean {
  return shape.flipY ?? false
}

export function localBoundsOf(shape: Shape): Box {
  switch (shape.kind) {
    case 'rect':
    case 'ellipse':
      return { x: shape.x, y: shape.y, w: shape.w, h: shape.h }
    case 'text': {
      const w = Math.max(shape.text.length, 1) * shape.heightUm * 0.6
      return { x: shape.x, y: shape.y, w, h: shape.heightUm }
    }
    case 'lineSpace': {
      const span = patternSpan(shape.count, shape.lineWidthUm, shape.spaceUm)
      if (shape.orientation === 'vertical') {
        return {
          x: shape.x,
          y: shape.y,
          w: Math.max(span, MIN_UM),
          h: Math.max(shape.lengthUm, MIN_UM),
        }
      }
      return {
        x: shape.x,
        y: shape.y,
        w: Math.max(shape.lengthUm, MIN_UM),
        h: Math.max(span, MIN_UM),
      }
    }
    case 'grid': {
      return {
        x: shape.x,
        y: shape.y,
        w: Math.max(
          patternSpan(shape.cols, shape.lineWidthUm, shape.spaceUm),
          MIN_UM,
        ),
        h: Math.max(
          patternSpan(shape.rows, shape.lineWidthUm, shape.spaceUm),
          MIN_UM,
        ),
      }
    }
  }
}

export function centerOf(box: Box): Point {
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 }
}

export function rotationOriginOf(shape: Shape): Point {
  return centerOf(localBoundsOf(shape))
}

export function rotatePoint(
  p: Point,
  origin: Point,
  rotationDeg: number,
): Point {
  if (!rotationDeg) return p
  const rad = (rotationDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const dx = p.x - origin.x
  const dy = p.y - origin.y
  return {
    x: origin.x + dx * cos - dy * sin,
    y: origin.y + dx * sin + dy * cos,
  }
}

function flipPoint(p: Point, origin: Point, flipX?: boolean, flipY?: boolean): Point {
  return {
    x: flipX ? origin.x - (p.x - origin.x) : p.x,
    y: flipY ? origin.y - (p.y - origin.y) : p.y,
  }
}

function transformPoint(
  p: Point,
  origin: Point,
  rotationDeg: number,
  flipX?: boolean,
  flipY?: boolean,
): Point {
  return rotatePoint(flipPoint(p, origin, flipX, flipY), origin, rotationDeg)
}

function unrotatePoint(
  p: Point,
  origin: Point,
  rotationDeg: number,
): Point {
  return rotatePoint(p, origin, -rotationDeg)
}

function rectPoints(rect: RectPrimitive): Point[] {
  const pts = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.w, y: rect.y },
    { x: rect.x + rect.w, y: rect.y + rect.h },
    { x: rect.x, y: rect.y + rect.h },
  ]
  const rotationDeg = rect.rotationDeg ?? 0
  const origin = rect.rotationOrigin ?? centerOf(rect)
  if (!rotationDeg && !rect.flipX && !rect.flipY) return pts
  return pts.map((p) => transformPoint(p, origin, rotationDeg, rect.flipX, rect.flipY))
}

function boxFromPoints(points: Point[]): Box {
  if (points.length === 0) return { x: 0, y: 0, w: 0, h: 0 }
  let minX = points[0].x
  let maxX = points[0].x
  let minY = points[0].y
  let maxY = points[0].y
  for (const p of points.slice(1)) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

export function framePointsOf(shape: Shape): Point[] {
  const box = localBoundsOf(shape)
  return rectPoints({
    ...box,
    rotationDeg: shapeRotationDeg(shape),
    rotationOrigin: centerOf(box),
  })
}

function ellipsePoints(shape: Extract<Shape, { kind: 'ellipse' }>, segments = 96): Point[] {
  const box = localBoundsOf(shape)
  const origin = centerOf(box)
  const rotationDeg = shapeRotationDeg(shape)
  const rx = box.w / 2
  const ry = box.h / 2
  const pts: Point[] = []
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2
    const p = {
      x: origin.x + Math.cos(t) * rx,
      y: origin.y + Math.sin(t) * ry,
    }
    pts.push(rotationDeg ? rotatePoint(p, origin, rotationDeg) : p)
  }
  return pts
}

export function shapeRectPrimitives(shape: Shape): RectPrimitive[] {
  const rotationDeg = shapeRotationDeg(shape)
  const origin = rotationOriginOf(shape)
  const flipX = shapeFlipX(shape)
  const flipY = shapeFlipY(shape)

  switch (shape.kind) {
    case 'rect':
      return [{
        x: shape.x,
        y: shape.y,
        w: shape.w,
        h: shape.h,
        rotationDeg,
        rotationOrigin: origin,
        flipX,
        flipY,
      }]
    case 'lineSpace': {
      const out: RectPrimitive[] = []
      const lineWidthUm = Math.max(MIN_LINE_UM, shape.lineWidthUm)
      const spaceUm = Math.max(0, shape.spaceUm)
      const pitch = lineWidthUm + spaceUm
      const count = Math.max(1, Math.round(shape.count))
      for (let i = 0; i < count; i++) {
        if (shape.orientation === 'horizontal') {
          out.push({
            x: shape.x,
            y: shape.y + i * pitch,
            w: Math.max(shape.lengthUm, MIN_UM),
            h: lineWidthUm,
            rotationDeg,
            rotationOrigin: origin,
            flipX,
            flipY,
          })
        } else {
          out.push({
            x: shape.x + i * pitch,
            y: shape.y,
            w: lineWidthUm,
            h: Math.max(shape.lengthUm, MIN_UM),
            rotationDeg,
            rotationOrigin: origin,
            flipX,
            flipY,
          })
        }
      }
      return out
    }
    case 'grid': {
      const out: RectPrimitive[] = []
      const lineWidthUm = Math.max(MIN_LINE_UM, shape.lineWidthUm)
      const spaceUm = Math.max(0, shape.spaceUm)
      const pitch = lineWidthUm + spaceUm
      const cols = Math.max(1, Math.round(shape.cols))
      const rows = Math.max(1, Math.round(shape.rows))
      const width = patternSpan(cols, lineWidthUm, spaceUm)
      const height = patternSpan(rows, lineWidthUm, spaceUm)
      for (let c = 0; c < cols; c++) {
        out.push({
          x: shape.x + c * pitch,
          y: shape.y,
          w: lineWidthUm,
          h: height,
          rotationDeg,
          rotationOrigin: origin,
          flipX,
          flipY,
        })
      }
      for (let r = 0; r < rows; r++) {
        out.push({
          x: shape.x,
          y: shape.y + r * pitch,
          w: width,
          h: lineWidthUm,
          rotationDeg,
          rotationOrigin: origin,
          flipX,
          flipY,
        })
      }
      return out
    }
    default:
      return []
  }
}

export function boundaryPolygonsForShape(shape: Shape): Point[][] {
  switch (shape.kind) {
    case 'rect':
    case 'lineSpace':
    case 'grid':
      return shapeRectPrimitives(shape).map(rectPoints)
    case 'ellipse':
      return [ellipsePoints(shape)]
    case 'text':
      return []
  }
}

export function shapeBounds(shape: Shape): Box {
  const points =
    shape.kind === 'ellipse'
      ? ellipsePoints(shape, 64)
      : shape.kind === 'text'
        ? framePointsOf(shape)
        : shapeRectPrimitives(shape).flatMap(rectPoints)
  return boxFromPoints(points.length > 0 ? points : framePointsOf(shape))
}

function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const pi = polygon[i]
    const pj = polygon[j]
    const crosses =
      pi.y > point.y !== pj.y > point.y &&
      point.x < ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y) + pi.x
    if (crosses) inside = !inside
  }
  return inside
}

export function pointInShape(point: Point, shape: Shape): boolean {
  if (shape.kind === 'ellipse') {
    const box = localBoundsOf(shape)
    const origin = centerOf(box)
    const p = unrotatePoint(point, origin, shapeRotationDeg(shape))
    const rx = Math.max(box.w / 2, MIN_UM)
    const ry = Math.max(box.h / 2, MIN_UM)
    const dx = (p.x - origin.x) / rx
    const dy = (p.y - origin.y) / ry
    return dx * dx + dy * dy <= 1
  }

  const polygons =
    shape.kind === 'text'
      ? [framePointsOf(shape)]
      : shapeRectPrimitives(shape).map(rectPoints)
  return polygons.some((polygon) => pointInPolygon(point, polygon))
}

function patchShapeFromBox(shape: Shape, box: Box): Partial<Shape> {
  switch (shape.kind) {
    case 'rect':
    case 'ellipse':
      return { x: box.x, y: box.y, w: box.w, h: box.h } as Partial<Shape>
    case 'text':
      return {
        x: box.x,
        y: box.y,
        heightUm: Math.max(box.h, MIN_UM),
      } as Partial<Shape>
    case 'lineSpace':
      if (shape.orientation === 'vertical') {
        return {
          x: box.x,
          y: box.y,
          count: countForSpan(box.w, shape.lineWidthUm, shape.spaceUm),
          lengthUm: Math.max(box.h, MIN_UM),
        } as Partial<Shape>
      }
      return {
        x: box.x,
        y: box.y,
        count: countForSpan(box.h, shape.lineWidthUm, shape.spaceUm),
        lengthUm: Math.max(box.w, MIN_UM),
      } as Partial<Shape>
    case 'grid':
      return {
        x: box.x,
        y: box.y,
        cols: countForSpan(box.w, shape.lineWidthUm, shape.spaceUm),
        rows: countForSpan(box.h, shape.lineWidthUm, shape.spaceUm),
      } as Partial<Shape>
  }
}

export function moveShapeBy(shape: Shape, dx: number, dy: number): Partial<Shape> {
  return { x: shape.x + dx, y: shape.y + dy } as Partial<Shape>
}

export function rotateShapeTo(
  shape: Shape,
  rotationDeg: number,
): Partial<Shape> {
  return {
    rotationDeg: normalizeRotation(rotationDeg),
  } as Partial<Shape>
}

function cornerOf(box: Box, handle: CornerHandle): Point {
  switch (handle) {
    case 'nw':
      return { x: box.x, y: box.y }
    case 'ne':
      return { x: box.x + box.w, y: box.y }
    case 'se':
      return { x: box.x + box.w, y: box.y + box.h }
    case 'sw':
      return { x: box.x, y: box.y + box.h }
  }
}

function oppositeCorner(handle: CornerHandle): CornerHandle {
  switch (handle) {
    case 'nw':
      return 'se'
    case 'ne':
      return 'sw'
    case 'se':
      return 'nw'
    case 'sw':
      return 'ne'
  }
}

function cornerAfterCrossing(
  corner: CornerHandle,
  crossedX: boolean,
  crossedY: boolean,
): CornerHandle {
  let next = corner
  if (crossedX) {
    switch (next) {
      case 'nw':
        next = 'ne'
        break
      case 'ne':
        next = 'nw'
        break
      case 'se':
        next = 'sw'
        break
      case 'sw':
        next = 'se'
        break
    }
  }
  if (crossedY) {
    switch (next) {
      case 'nw':
        next = 'sw'
        break
      case 'ne':
        next = 'se'
        break
      case 'se':
        next = 'ne'
        break
      case 'sw':
        next = 'nw'
        break
    }
  }
  return next
}

function handleSign(handle: CornerHandle): { x: -1 | 1; y: -1 | 1 } {
  switch (handle) {
    case 'nw':
      return { x: -1, y: -1 }
    case 'ne':
      return { x: 1, y: -1 }
    case 'se':
      return { x: 1, y: 1 }
    case 'sw':
      return { x: -1, y: 1 }
  }
}

interface ResizeFromCornerResult {
  box: Box
  crossedX: boolean
  crossedY: boolean
}

function resizeBoxFromCorner(
  box: Box,
  handle: CornerHandle,
  pointer: Point,
): ResizeFromCornerResult {
  const anchor = cornerOf(box, oppositeCorner(handle))
  const sign = handleSign(handle)
  const dx = pointer.x - anchor.x
  const dy = pointer.y - anchor.y
  const crossedX = dx * sign.x < 0
  const crossedY = dy * sign.y < 0
  const directionX = crossedX ? -sign.x : sign.x
  const directionY = crossedY ? -sign.y : sign.y
  const width = Math.max(Math.abs(dx), MIN_UM)
  const height = Math.max(Math.abs(dy), MIN_UM)
  const x1 = anchor.x + directionX * width
  const y1 = anchor.y + directionY * height

  return {
    box: {
      x: Math.min(anchor.x, x1),
      y: Math.min(anchor.y, y1),
      w: width,
      h: height,
    },
    crossedX,
    crossedY,
  }
}

export function resizeShapeFromCorner(
  shape: Shape,
  handle: CornerHandle,
  pointer: Point,
): Partial<Shape> {
  const rotationDeg = shapeRotationDeg(shape)
  const sourceBox = localBoundsOf(shape)
  const sourceOrigin = centerOf(sourceBox)
  const anchorHandle = oppositeCorner(handle)
  const anchorWorld = rotatePoint(cornerOf(sourceBox, anchorHandle), sourceOrigin, rotationDeg)
  const pointerLocal = unrotatePoint(pointer, sourceOrigin, rotationDeg)
  const requested = resizeBoxFromCorner(sourceBox, handle, pointerLocal)
  const patch = {
    ...patchShapeFromBox(shape, requested.box),
    flipX: requested.crossedX ? !shapeFlipX(shape) : shapeFlipX(shape),
    flipY: requested.crossedY ? !shapeFlipY(shape) : shapeFlipY(shape),
  } as Partial<Shape>
  const candidate = { ...shape, ...patch } as Shape
  const actualBox = localBoundsOf(candidate)
  const actualAnchorHandle = cornerAfterCrossing(
    anchorHandle,
    requested.crossedX,
    requested.crossedY,
  )
  const actualAnchorWorld = rotatePoint(
    cornerOf(actualBox, actualAnchorHandle),
    centerOf(actualBox),
    rotationDeg,
  )
  const dx = anchorWorld.x - actualAnchorWorld.x
  const dy = anchorWorld.y - actualAnchorWorld.y

  return {
    ...patch,
    x: candidate.x + dx,
    y: candidate.y + dy,
  } as Partial<Shape>
}
