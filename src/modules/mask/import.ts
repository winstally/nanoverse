import { Calibration } from './calibration'
import { newId, RectShape, Shape, TextShape } from './shape'

interface Point {
  x: number
  y: number
}

export interface ImportedMask {
  shapes: Shape[]
  format: 'BMP' | 'GDS'
  skipped: number
}

function readAscii(bytes: Uint8Array, start: number, length: number): string {
  let out = ''
  for (let i = 0; i < length; i++) {
    const c = bytes[start + i]
    if (c !== 0) out += String.fromCharCode(c)
  }
  return out.trim()
}

function bmpPaletteLuminance(bytes: Uint8Array, offset: number, index: number): number {
  const p = offset + index * 4
  const b = bytes[p] ?? 0
  const g = bytes[p + 1] ?? 0
  const r = bytes[p + 2] ?? 0
  return 0.299 * r + 0.587 * g + 0.114 * b
}

function decodeBmp(bytes: Uint8Array): {
  width: number
  height: number
  isWhite: (x: number, y: number) => boolean
} {
  if (bytes.length < 54 || bytes[0] !== 0x42 || bytes[1] !== 0x4d) {
    throw new Error('BMPとして解釈できませんでした')
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const pixelOffset = view.getUint32(10, true)
  const dibSize = view.getUint32(14, true)
  const width = view.getInt32(18, true)
  const rawHeight = view.getInt32(22, true)
  const planes = view.getUint16(26, true)
  const bpp = view.getUint16(28, true)
  const compression = view.getUint32(30, true)
  const colorsUsed = view.getUint32(46, true)

  if (width <= 0 || rawHeight === 0 || planes !== 1) {
    throw new Error('対応していないBMPです')
  }
  if (compression !== 0) {
    throw new Error('圧縮BMPは読み込めません')
  }
  if (![1, 4, 8, 24, 32].includes(bpp)) {
    throw new Error(`${bpp}bit BMPは読み込めません`)
  }

  const height = Math.abs(rawHeight)
  const topDown = rawHeight < 0
  const rowStride = Math.floor((bpp * width + 31) / 32) * 4
  const paletteOffset = 14 + dibSize
  const paletteCount =
    bpp <= 8 ? Math.max(colorsUsed || 1 << bpp, 1 << bpp) : 0

  const luminanceAt = (x: number, y: number): number => {
    const fileY = topDown ? y : height - 1 - y
    const row = pixelOffset + fileY * rowStride

    if (bpp === 1) {
      const byte = bytes[row + (x >> 3)] ?? 0
      const index = (byte >> (7 - (x & 7))) & 1
      return bmpPaletteLuminance(bytes, paletteOffset, index)
    }
    if (bpp === 4) {
      const byte = bytes[row + (x >> 1)] ?? 0
      const index = x % 2 === 0 ? (byte >> 4) & 0x0f : byte & 0x0f
      return index < paletteCount
        ? bmpPaletteLuminance(bytes, paletteOffset, index)
        : 0
    }
    if (bpp === 8) {
      const index = bytes[row + x] ?? 0
      return index < paletteCount
        ? bmpPaletteLuminance(bytes, paletteOffset, index)
        : 0
    }

    const p = row + x * (bpp / 8)
    const b = bytes[p] ?? 0
    const g = bytes[p + 1] ?? 0
    const r = bytes[p + 2] ?? 0
    return 0.299 * r + 0.587 * g + 0.114 * b
  }

  return {
    width,
    height,
    isWhite: (x, y) => luminanceAt(x, y) >= 128,
  }
}

function inferBackgroundWhite(
  width: number,
  height: number,
  isWhite: (x: number, y: number) => boolean,
): boolean {
  let white = 0
  let total = 0
  for (let x = 0; x < width; x++) {
    if (isWhite(x, 0)) white++
    if (isWhite(x, height - 1)) white++
    total += 2
  }
  for (let y = 1; y < height - 1; y++) {
    if (isWhite(0, y)) white++
    if (isWhite(width - 1, y)) white++
    total += 2
  }
  return white >= total / 2
}

function rectsFromBmp(
  width: number,
  height: number,
  isFeature: (x: number, y: number) => boolean,
  cal: Calibration,
): RectShape[] {
  const pxWUm = cal.substrateWUm / width
  const pxHUm = cal.substrateHUm / height
  const shapes: RectShape[] = []
  const active = new Map<string, { x0: number; x1: number; y0: number; y1: number }>()

  const flush = (key: string) => {
    const run = active.get(key)
    if (!run) return
    active.delete(key)
    shapes.push({
      id: newId('rect-'),
      kind: 'rect',
      x: run.x0 * pxWUm,
      y: run.y0 * pxHUm,
      w: (run.x1 - run.x0) * pxWUm,
      h: (run.y1 - run.y0) * pxHUm,
    })
  }

  for (let y = 0; y < height; y++) {
    const seen = new Set<string>()
    let x = 0
    while (x < width) {
      while (x < width && !isFeature(x, y)) x++
      if (x >= width) break
      const x0 = x
      while (x < width && isFeature(x, y)) x++
      const x1 = x
      const key = `${x0}:${x1}`
      seen.add(key)
      const existing = active.get(key)
      if (existing && existing.y1 === y) {
        existing.y1 = y + 1
      } else {
        active.set(key, { x0, x1, y0: y, y1: y + 1 })
      }
    }
    for (const key of Array.from(active.keys())) {
      if (!seen.has(key)) flush(key)
    }
  }

  for (const key of Array.from(active.keys())) flush(key)
  return shapes
}

function decodeGdsReal8(bytes: Uint8Array): number {
  if (bytes.length !== 8 || bytes.every((b) => b === 0)) return 0
  const sign = bytes[0] & 0x80 ? -1 : 1
  const exponent = (bytes[0] & 0x7f) - 64
  let fraction = 0
  for (let i = 1; i < 8; i++) {
    fraction += bytes[i] / 256 ** i
  }
  return sign * fraction * 16 ** exponent
}

function isRectPoints(points: Point[]): boolean {
  if (points.length !== 4) return false
  const edges: Point[] = []
  const lengths: number[] = []
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    const q = points[(i + 1) % points.length]
    const edge = { x: q.x - p.x, y: q.y - p.y }
    const length = Math.hypot(edge.x, edge.y)
    if (length <= 0) return false
    edges.push(edge)
    lengths.push(length)
  }
  const eps = 1e-3
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i]
    const next = edges[(i + 1) % edges.length]
    if (
      Math.abs(edge.x * next.x + edge.y * next.y) >
      eps * lengths[i] * lengths[(i + 1) % edges.length]
    ) {
      return false
    }
  }
  return true
}

function rectShapeFromPoints(points: Point[]): RectShape | null {
  if (!isRectPoints(points)) return null
  const p0 = points[0]
  const p1 = points[1]
  const p2 = points[2]
  const w = Math.hypot(p1.x - p0.x, p1.y - p0.y)
  const h = Math.hypot(p2.x - p1.x, p2.y - p1.y)
  const cx = points.reduce((sum, p) => sum + p.x, 0) / 4
  const cy = points.reduce((sum, p) => sum + p.y, 0) / 4
  const rotationDeg = (Math.atan2(p1.y - p0.y, p1.x - p0.x) * 180) / Math.PI
  return {
    id: newId('rect-'),
    kind: 'rect',
    x: cx - w / 2,
    y: cy - h / 2,
    w,
    h,
    rotationDeg: Math.abs(rotationDeg) < 1e-6 ? undefined : rotationDeg,
  }
}

function decodeGds(bytes: Uint8Array, cal: Calibration): { shapes: Shape[]; skipped: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const shapes: Shape[] = []
  let skipped = 0
  let dbuUm = 0.001
  let current: 'boundary' | 'text' | null = null
  let xy: Point[] = []
  let text = ''

  const finish = () => {
    if (current === 'boundary') {
      const open =
        xy.length > 1 &&
        xy[0].x === xy[xy.length - 1].x &&
        xy[0].y === xy[xy.length - 1].y
          ? xy.slice(0, -1)
          : xy
      const shape = rectShapeFromPoints(open)
      if (shape) shapes.push(shape)
      else skipped++
    } else if (current === 'text' && xy[0] && text) {
      const p = xy[0]
      const shape: TextShape = {
        id: newId('text-'),
        kind: 'text',
        x: p.x,
        y: p.y,
        text,
        heightUm: 10,
      }
      shapes.push(shape)
    }
    current = null
    xy = []
    text = ''
  }

  for (let offset = 0; offset + 4 <= bytes.length; ) {
    const len = view.getUint16(offset, false)
    const record = bytes[offset + 2]
    const dataType = bytes[offset + 3]
    if (len < 4 || offset + len > bytes.length) {
      throw new Error('GDSとして解釈できませんでした')
    }
    const dataStart = offset + 4
    const dataLen = len - 4

    if (record === 0x03 && dataType === 0x05 && dataLen >= 16) {
      dbuUm = decodeGdsReal8(bytes.slice(dataStart + 8, dataStart + 16)) * 1e6
    } else if (record === 0x08) {
      finish()
      current = 'boundary'
    } else if (record === 0x0c) {
      finish()
      current = 'text'
    } else if (record === 0x10 && dataType === 0x03 && current) {
      xy = []
      for (let p = dataStart; p + 7 < dataStart + dataLen; p += 8) {
        const x = view.getInt32(p, false) * dbuUm
        const yGds = view.getInt32(p + 4, false) * dbuUm
        xy.push({ x, y: cal.substrateHUm - yGds })
      }
    } else if (record === 0x19 && current === 'text') {
      text = readAscii(bytes, dataStart, dataLen)
    } else if (record === 0x11) {
      finish()
    }

    offset += len
  }
  finish()
  return { shapes, skipped }
}

export async function importMaskFile(
  file: File,
  cal: Calibration,
): Promise<ImportedMask> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const lower = file.name.toLowerCase()

  if (lower.endsWith('.bmp') || (bytes[0] === 0x42 && bytes[1] === 0x4d)) {
    const bmp = decodeBmp(bytes)
    const backgroundWhite = inferBackgroundWhite(bmp.width, bmp.height, bmp.isWhite)
    const shapes = rectsFromBmp(
      bmp.width,
      bmp.height,
      (x, y) => bmp.isWhite(x, y) !== backgroundWhite,
      cal,
    )
    return {
      shapes,
      format: 'BMP',
      skipped: 0,
    }
  }

  if (lower.endsWith('.gds')) {
    const { shapes, skipped } = decodeGds(bytes, cal)
    return {
      shapes,
      format: 'GDS',
      skipped,
    }
  }

  throw new Error('BMPまたはGDSを選択してください')
}
