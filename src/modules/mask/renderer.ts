import { MaskDocument } from './document'
import { Shape } from './shape'
import { Calibration, umPerPxX, umPerPxY } from './calibration'
import { encodeOneBitBmp } from './bmp'
import {
  centerOf,
  localBoundsOf,
  RectPrimitive,
  shapeFlipX,
  shapeFlipY,
  shapeRectPrimitives,
  shapeRotationDeg,
} from './geometry'
import { downloadBlob } from '@/lib/download'

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas
type AnyCtx =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D

function getContext2d(canvas: AnyCanvas): AnyCtx {
  const ctx = (canvas as HTMLCanvasElement).getContext('2d')
  if (!ctx) {
    throw new Error('2D canvas context is not available')
  }
  return ctx as AnyCtx
}

function drawShape(
  ctx: AnyCtx,
  shape: Shape,
  cal: Calibration
): void {
  const uppX = umPerPxX(cal)
  const uppY = umPerPxY(cal)
  const toPxX = (uXum: number) => uXum / uppX
  const toPxY = (uYum: number) => uYum / uppY
  const toPxPoint = (p: { x: number; y: number }) => ({
    x: toPxX(p.x),
    y: toPxY(p.y),
  })

  switch (shape.kind) {
    case 'rect':
    case 'lineSpace':
    case 'grid': {
      for (const rect of shapeRectPrimitives(shape)) {
        drawRectPrimitive(ctx, rect, cal)
      }
      break
    }
    case 'ellipse': {
      const box = localBoundsOf(shape)
      const origin = centerOf(box)
      const originPx = toPxPoint(origin)
      const rotationDeg = shapeRotationDeg(shape)
      const flipX = shapeFlipX(shape)
      const flipY = shapeFlipY(shape)
      ctx.save()
      if (rotationDeg || flipX || flipY) {
        ctx.translate(originPx.x, originPx.y)
        ctx.rotate((rotationDeg * Math.PI) / 180)
        ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1)
        ctx.translate(-originPx.x, -originPx.y)
      }
      ctx.beginPath()
      ctx.ellipse(
        originPx.x,
        originPx.y,
        toPxX(box.w) / 2,
        toPxY(box.h) / 2,
        0,
        0,
        Math.PI * 2,
      )
      ctx.fill()
      ctx.restore()
      break
    }
    case 'text': {
      const box = localBoundsOf(shape)
      const origin = centerOf(box)
      const originPx = toPxPoint(origin)
      const rotationDeg = shapeRotationDeg(shape)
      const flipX = shapeFlipX(shape)
      const flipY = shapeFlipY(shape)
      const sizePx = toPxY(shape.heightUm)
      const family = shape.fontFamily ?? 'sans-serif'
      ctx.font = `${sizePx}px ${family}`
      ctx.textBaseline = 'top'
      ctx.save()
      if (rotationDeg || flipX || flipY) {
        ctx.translate(originPx.x, originPx.y)
        ctx.rotate((rotationDeg * Math.PI) / 180)
        ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1)
        ctx.translate(-originPx.x, -originPx.y)
      }
      ctx.fillText(shape.text, toPxX(shape.x), toPxY(shape.y))
      ctx.restore()
      break
    }
  }
}

function drawRectPrimitive(
  ctx: AnyCtx,
  rect: RectPrimitive,
  cal: Calibration,
): void {
  const uppX = umPerPxX(cal)
  const uppY = umPerPxY(cal)
  const rotationDeg = rect.rotationDeg ?? 0
  const flipX = rect.flipX ?? false
  const flipY = rect.flipY ?? false

  if (!rotationDeg && !flipX && !flipY) {
    const x0 = Math.max(0, Math.min(cal.dmdW, Math.round(rect.x / uppX)))
    const y0 = Math.max(0, Math.min(cal.dmdH, Math.round(rect.y / uppY)))
    const x1 = Math.max(0, Math.min(cal.dmdW, Math.round((rect.x + rect.w) / uppX)))
    const y1 = Math.max(0, Math.min(cal.dmdH, Math.round((rect.y + rect.h) / uppY)))
    if (x1 > x0 && y1 > y0) ctx.fillRect(x0, y0, x1 - x0, y1 - y0)
    return
  }

  const origin = rect.rotationOrigin ?? centerOf(rect)
  const ox = origin.x / uppX
  const oy = origin.y / uppY
  const px = rect.x / uppX
  const py = rect.y / uppY
  const pw = rect.w / uppX
  const ph = rect.h / uppY

  ctx.save()
  ctx.translate(ox, oy)
  ctx.rotate((rotationDeg * Math.PI) / 180)
  ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1)
  ctx.translate(-ox, -oy)
  ctx.fillRect(px, py, pw, ph)
  ctx.restore()
}

export function renderToCanvas(
  doc: MaskDocument,
  cal: Calibration,
  canvas: HTMLCanvasElement | OffscreenCanvas
): void {
  canvas.width = cal.dmdW
  canvas.height = cal.dmdH

  const ctx = getContext2d(canvas)
  ctx.imageSmoothingEnabled = false

  const isDarkOnLight = doc.polarity === 'darkOnLight'
  // darkOnLight -> fill white, features black.
  // lightOnDark -> fill black, features white.
  ctx.fillStyle = isDarkOnLight ? '#ffffff' : '#000000'
  ctx.fillRect(0, 0, cal.dmdW, cal.dmdH)

  ctx.fillStyle = isDarkOnLight ? '#000000' : '#ffffff'
  for (const shape of doc.shapes) {
    drawShape(ctx, shape, cal)
  }
}

function createOffscreen(width: number, height: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height)
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function exportBmpBlob(doc: MaskDocument, cal: Calibration): Blob {
  const canvas = createOffscreen(cal.dmdW, cal.dmdH)
  renderToCanvas(doc, cal, canvas)

  const ctx = getContext2d(canvas)
  const image = ctx.getImageData(0, 0, cal.dmdW, cal.dmdH)
  const px = image.data

  const luminanceWhite = (x: number, y: number): boolean => {
    const i = (y * cal.dmdW + x) * 4
    const r = px[i]
    const g = px[i + 1]
    const b = px[i + 2]
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b
    return luminance >= 128
  }

  const bytes = encodeOneBitBmp(cal.dmdW, cal.dmdH, luminanceWhite)
  // Copy into a fresh ArrayBuffer-backed view so the Blob gets a plain BlobPart.
  const out = new Uint8Array(bytes.length)
  out.set(bytes)
  return new Blob([out], { type: 'image/bmp' })
}

export function downloadBmp(
  doc: MaskDocument,
  cal: Calibration,
  filename: string
): void {
  const blob = exportBmpBlob(doc, cal)
  downloadBlob(blob, filename)
}
