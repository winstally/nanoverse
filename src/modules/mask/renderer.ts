import { MaskDocument } from './document'
import { Shape } from './shape'
import { Calibration, umPerPx } from './calibration'
import { encodeOneBitBmp } from './bmp'

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
  const upp = umPerPx(cal)
  const toPxX = (uXum: number) => uXum / upp
  const toPxY = (uYum: number) => uYum / upp

  switch (shape.kind) {
    case 'rect': {
      const px = toPxX(shape.x)
      const py = toPxY(shape.y)
      const pw = toPxX(shape.w)
      const ph = toPxY(shape.h)
      if (shape.rotationDeg) {
        ctx.save()
        ctx.translate(px + pw / 2, py + ph / 2)
        ctx.rotate((shape.rotationDeg * Math.PI) / 180)
        ctx.fillRect(-pw / 2, -ph / 2, pw, ph)
        ctx.restore()
      } else {
        ctx.fillRect(px, py, pw, ph)
      }
      break
    }
    case 'ellipse': {
      const px = toPxX(shape.x)
      const py = toPxY(shape.y)
      const pw = toPxX(shape.w)
      const ph = toPxY(shape.h)
      ctx.beginPath()
      ctx.ellipse(px + pw / 2, py + ph / 2, pw / 2, ph / 2, 0, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 'text': {
      const px = toPxX(shape.x)
      const py = toPxY(shape.y)
      const sizePx = toPxY(shape.heightUm)
      const family = shape.fontFamily ?? 'sans-serif'
      ctx.font = `${sizePx}px ${family}`
      ctx.textBaseline = 'top'
      ctx.fillText(shape.text, px, py)
      break
    }
    case 'lineSpace': {
      const lineWidthPx = toPxX(shape.lineWidthUm)
      const spacePx = toPxX(shape.spaceUm)
      const lengthPx =
        shape.orientation === 'horizontal'
          ? toPxX(shape.lengthUm)
          : toPxY(shape.lengthUm)
      const lineThickPxV = toPxY(shape.lineWidthUm)
      const spacePxV = toPxY(shape.spaceUm)

      ctx.save()
      if (shape.rotationDeg) {
        ctx.translate(toPxX(shape.x), toPxY(shape.y))
        ctx.rotate((shape.rotationDeg * Math.PI) / 180)
        ctx.translate(-toPxX(shape.x), -toPxY(shape.y))
      }
      for (let i = 0; i < shape.count; i++) {
        if (shape.orientation === 'horizontal') {
          // bars run horizontally, stacked along Y (down).
          const bx = toPxX(shape.x)
          const by = toPxY(shape.y) + i * (lineThickPxV + spacePxV)
          ctx.fillRect(bx, by, lengthPx, lineThickPxV)
        } else {
          // vertical bars, stacked along X (right).
          const bx = toPxX(shape.x) + i * (lineWidthPx + spacePx)
          const by = toPxY(shape.y)
          ctx.fillRect(bx, by, lineWidthPx, lengthPx)
        }
      }
      ctx.restore()
      break
    }
    case 'grid': {
      const pitchUm = shape.lineWidthUm + shape.spaceUm
      const areaWum = (shape.cols - 1) * pitchUm + shape.lineWidthUm
      const areaHum = (shape.rows - 1) * pitchUm + shape.lineWidthUm
      const x0 = toPxX(shape.x)
      const y0 = toPxY(shape.y)
      const areaWpx = toPxX(areaWum)
      const areaHpx = toPxY(areaHum)
      const lineWpx = toPxX(shape.lineWidthUm)
      const lineHpx = toPxY(shape.lineWidthUm)
      const pitchPxX = toPxX(pitchUm)
      const pitchPxY = toPxY(pitchUm)

      ctx.save()
      if (shape.rotationDeg) {
        ctx.translate(x0, y0)
        ctx.rotate((shape.rotationDeg * Math.PI) / 180)
        ctx.translate(-x0, -y0)
      }
      // vertical lines (run down the full grid height)
      for (let c = 0; c < shape.cols; c++) {
        ctx.fillRect(x0 + c * pitchPxX, y0, lineWpx, areaHpx)
      }
      // horizontal lines (run across the full grid width)
      for (let r = 0; r < shape.rows; r++) {
        ctx.fillRect(x0, y0 + r * pitchPxY, areaWpx, lineHpx)
      }
      ctx.restore()
      break
    }
  }
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

export function exportBmpBlob(doc: MaskDocument, cal: Calibration): Blob {
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
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
