import { describe, expect, it } from 'vitest'
import {
  framePointsOf,
  patternSpan,
  resizeShapeFromCorner,
  shapeBounds,
  shapeRectPrimitives,
} from './geometry'
import type { GridShape, LineSpaceShape, RectShape } from './shape'

function expectPointClose(
  actual: { x: number; y: number },
  expected: { x: number; y: number },
) {
  expect(actual.x).toBeCloseTo(expected.x, 8)
  expect(actual.y).toBeCloseTo(expected.y, 8)
}

describe('mask geometry', () => {
  it('uses one canonical span for grid vertical and horizontal primitives', () => {
    const shape: GridShape = {
      id: 'grid',
      kind: 'grid',
      x: 23.2,
      y: 18.7,
      lineWidthUm: 5,
      spaceUm: 10,
      cols: 5,
      rows: 5,
    }

    const primitives = shapeRectPrimitives(shape)
    const verticals = primitives.slice(0, shape.cols)
    const horizontals = primitives.slice(shape.cols)
    const expectedW = patternSpan(shape.cols, shape.lineWidthUm, shape.spaceUm)
    const expectedH = patternSpan(shape.rows, shape.lineWidthUm, shape.spaceUm)
    const bottomHorizontal = horizontals[horizontals.length - 1]

    expect(verticals[0].h).toBeCloseTo(expectedH)
    expect(horizontals[0].w).toBeCloseTo(expectedW)
    expect(verticals[0].y + verticals[0].h).toBeCloseTo(
      bottomHorizontal.y + bottomHorizontal.h,
    )
    expect(shapeBounds(shape)).toEqual({
      x: shape.x,
      y: shape.y,
      w: expectedW,
      h: expectedH,
    })
  })

  it('uses the same stripe span for bounds and primitives', () => {
    const shape: LineSpaceShape = {
      id: 'stripes',
      kind: 'lineSpace',
      x: 4,
      y: 8,
      lineWidthUm: 3,
      spaceUm: 2,
      count: 4,
      orientation: 'vertical',
      lengthUm: 40,
    }

    const primitives = shapeRectPrimitives(shape)
    const expectedSpan = patternSpan(shape.count, shape.lineWidthUm, shape.spaceUm)

    expect(primitives).toHaveLength(shape.count)
    expect(shapeBounds(shape)).toEqual({
      x: shape.x,
      y: shape.y,
      w: expectedSpan,
      h: shape.lengthUm,
    })
  })

  it('resizes a rotated rectangle by keeping the opposite corner anchored', () => {
    const shape: RectShape = {
      id: 'rect',
      kind: 'rect',
      x: 20,
      y: 30,
      w: 80,
      h: 40,
      rotationDeg: 35,
    }
    const before = framePointsOf(shape)
    const pointer = {
      x: before[2].x + 30,
      y: before[2].y + 25,
    }

    const patch = resizeShapeFromCorner(shape, 'se', pointer)
    const resized = { ...shape, ...patch } as RectShape
    const after = framePointsOf(resized)

    expectPointClose(after[0], before[0])
    expectPointClose(after[2], pointer)
  })

  it('flips instead of collapsing when a corner resize crosses the anchor', () => {
    const shape: RectShape = {
      id: 'rect',
      kind: 'rect',
      x: 20,
      y: 30,
      w: 80,
      h: 40,
      flipX: false,
      flipY: false,
    }
    const before = framePointsOf(shape)
    const pointer = { x: 10, y: 20 }

    const patch = resizeShapeFromCorner(shape, 'se', pointer)
    const resized = { ...shape, ...patch } as RectShape
    const after = framePointsOf(resized)

    expect(resized.flipX).toBe(true)
    expect(resized.flipY).toBe(true)
    expect(resized.w).toBeCloseTo(10)
    expect(resized.h).toBeCloseTo(10)
    expectPointClose(after[2], before[0])
    expectPointClose(after[0], pointer)
  })
})
