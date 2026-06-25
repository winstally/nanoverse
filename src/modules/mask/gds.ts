import { Calibration } from './calibration'
import { MaskDocument } from './document'
import { Shape } from './shape'
import { boundaryPolygonsForShape, shapeRotationDeg } from './geometry'
import { downloadBlob } from '@/lib/download'

const GDS_VERSION = 600
const GDS_UNIT_M = 1e-6 // user unit = 1 µm
const GDS_PRECISION_M = 1e-9 // database unit = 1 nm
const DBU_PER_UM = GDS_UNIT_M / GDS_PRECISION_M
const DEFAULT_LAYER = 1
const DEFAULT_DATATYPE = 0
interface Point {
  x: number
  y: number
}

type Bytes = Uint8Array<ArrayBufferLike>

function pushU16(out: number[], value: number): void {
  out.push((value >> 8) & 0xff, value & 0xff)
}

function pushI16(out: number[], value: number): void {
  pushU16(out, value & 0xffff)
}

function pushI32(out: number[], value: number): void {
  out.push(
    (value >> 24) & 0xff,
    (value >> 16) & 0xff,
    (value >> 8) & 0xff,
    value & 0xff,
  )
}

function int2(values: number[]): Bytes {
  const out: number[] = []
  values.forEach((v) => pushI16(out, v))
  return new Uint8Array(out)
}

function int4(values: number[]): Bytes {
  const out: number[] = []
  values.forEach((v) => pushI32(out, v))
  return new Uint8Array(out)
}

function ascii(text: string): Bytes {
  const out = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i++) {
    out[i] = text.charCodeAt(i) & 0x7f
  }
  return out
}

function gdsReal8(value: number): Bytes {
  if (value === 0) return new Uint8Array(8)

  const bytes = new Uint8Array(8)
  const sign = value < 0 ? 0x80 : 0
  let v = Math.abs(value)
  let exponent = 64

  while (v < 1 / 16) {
    v *= 16
    exponent -= 1
  }
  while (v >= 1) {
    v /= 16
    exponent += 1
  }

  bytes[0] = sign | exponent
  let fraction = v
  for (let i = 1; i < 8; i++) {
    fraction *= 256
    const b = Math.floor(fraction)
    bytes[i] = b
    fraction -= b
  }
  return bytes
}

function concatBytes(parts: Bytes[]): Uint8Array {
  const size = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(size)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function rec(recordType: number, dataType: number, data: Bytes = new Uint8Array()): Bytes {
  const paddedLength = data.length + (data.length % 2)
  const out = new Uint8Array(4 + paddedLength)
  out[0] = (out.length >> 8) & 0xff
  out[1] = out.length & 0xff
  out[2] = recordType
  out[3] = dataType
  out.set(data, 4)
  return out
}

function nowFields(): Bytes {
  const d = new Date()
  const fields = [
    d.getFullYear(),
    d.getMonth() + 1,
    d.getDate(),
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
  ]
  return int2([...fields, ...fields])
}

function safeGdsName(name: string, fallback: string): string {
  const normalized = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_$?]/g, '_')
    .slice(0, 32)
  return normalized || fallback
}

function toGdsPoint(p: Point, fieldHeightUm: number): Point {
  return { x: p.x, y: fieldHeightUm - p.y }
}

function writeBoundary(records: Bytes[], points: Point[]): void {
  if (points.length < 3) return

  const closed = [...points, points[0]]
  const coords: number[] = []
  for (const p of closed) {
    coords.push(Math.round(p.x * DBU_PER_UM), Math.round(p.y * DBU_PER_UM))
  }

  records.push(rec(0x08, 0x00)) // BOUNDARY
  records.push(rec(0x0d, 0x02, int2([DEFAULT_LAYER])))
  records.push(rec(0x0e, 0x02, int2([DEFAULT_DATATYPE])))
  records.push(rec(0x10, 0x03, int4(coords))) // XY
  records.push(rec(0x11, 0x00)) // ENDEL
}

function writeText(
  records: Bytes[],
  shape: Extract<Shape, { kind: 'text' }>,
  fieldHeightUm: number,
): void {
  const p = toGdsPoint({ x: shape.x, y: shape.y }, fieldHeightUm)
  records.push(rec(0x0c, 0x00)) // TEXT
  records.push(rec(0x0d, 0x02, int2([DEFAULT_LAYER])))
  records.push(rec(0x16, 0x02, int2([0]))) // TEXTTYPE
  records.push(
    rec(0x10, 0x03, int4([Math.round(p.x * DBU_PER_UM), Math.round(p.y * DBU_PER_UM)])),
  )
  const rotationDeg = shapeRotationDeg(shape)
  if (rotationDeg) {
    // Canvas coordinates are y-down; GDS is y-up, so text angle changes sign.
    records.push(rec(0x1c, 0x05, gdsReal8(-rotationDeg)))
  }
  records.push(rec(0x19, 0x06, ascii(shape.text))) // STRING
  records.push(rec(0x11, 0x00))
}

function boundaryPointsForShape(shape: Shape, fieldHeightUm: number): Point[][] {
  const map = (pts: Point[]) => pts.map((p) => toGdsPoint(p, fieldHeightUm))
  return boundaryPolygonsForShape(shape).map(map)
}

export function encodeGds(doc: MaskDocument, cal: Calibration): Uint8Array {
  const records: Bytes[] = []
  const libName = safeGdsName(doc.name, 'MASK_LIB')
  const cellName = safeGdsName(doc.name, 'MASK')

  records.push(rec(0x00, 0x02, int2([GDS_VERSION])))
  records.push(rec(0x01, 0x02, nowFields())) // BGNLIB
  records.push(rec(0x02, 0x06, ascii(libName))) // LIBNAME
  records.push(
    rec(
      0x03,
      0x05,
      concatBytes([gdsReal8(GDS_PRECISION_M / GDS_UNIT_M), gdsReal8(GDS_PRECISION_M)]),
    ),
  )
  records.push(rec(0x05, 0x02, nowFields())) // BGNSTR
  records.push(rec(0x06, 0x06, ascii(cellName))) // STRNAME

  for (const shape of doc.shapes) {
    if (shape.kind === 'text') {
      writeText(records, shape, cal.substrateHUm)
      continue
    }
    for (const points of boundaryPointsForShape(shape, cal.substrateHUm)) {
      writeBoundary(records, points)
    }
  }

  records.push(rec(0x07, 0x00)) // ENDSTR
  records.push(rec(0x04, 0x00)) // ENDLIB
  return concatBytes(records)
}

function exportGdsBlob(doc: MaskDocument, cal: Calibration): Blob {
  const bytes = encodeGds(doc, cal)
  const out = new Uint8Array(bytes.length)
  out.set(bytes)
  return new Blob([out], { type: 'application/octet-stream' })
}

export function downloadGds(
  doc: MaskDocument,
  cal: Calibration,
  filename: string,
): void {
  const blob = exportGdsBlob(doc, cal)
  downloadBlob(blob, filename)
}
