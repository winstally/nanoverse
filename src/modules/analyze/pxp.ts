import { Trace, TRACE_COLORS, DEFAULT_LINE_WIDTH } from './types'
import type { MeasurementType } from './types'

/**
 * Igor Pro packed-experiment (.pxp) reader — imports the measured FACTS only:
 * the raw data waves (X axis + Y spectra), paired via the Display recreation
 * macro, with the measurement type auto-detected. Igor fit / analysis artifacts
 * (`fit_*`, `W_coef`, …) and presentation (colours, legend) are not imported.
 *
 * The .pxp is a sequence of records: PackedFileRecordHeader { recordType:u16,
 * version:i16, numDataBytes:i32 } + data. Wave records (type 3) hold an Igor
 * Binary Wave (version 2 or 5). Recreation/procedure records (type 4/5) hold the
 * macro text we parse `Display … vs <x>` / `Label bottom "…"` from.
 */

export interface PxpImportResult {
  traces: Trace[]
  /** Auto-detected measurement type (null if undetermined; caller may default). */
  type: MeasurementType | null
  /** Data waves that couldn't be paired to a same-length X wave (skipped). */
  skipped: number
}

interface RawWave {
  name: string
  npnts: number
  data: number[]
  /** X scaling: x[i] = sfB + i·sfA (Igor SetScale). */
  sfA: number
  sfB: number
}

// Igor wave numeric type flags (IgorBin.h).
function pointSize(type: number): number {
  let s: number
  if (type & 2) s = 4 // NT_FP32
  else if (type & 4) s = 8 // NT_FP64
  else if (type & 0x10) s = 2 // NT_I16
  else if (type & 0x20) s = 4 // NT_I32
  else if (type & 8) s = 1 // NT_I8
  else s = 0
  if (type & 1) s *= 2 // NT_CMPLX
  return s
}

// Igor analysis outputs (not measured facts).
const ARTIFACT =
  /^(fit_|fitX_|res_)|^(W_coef|W_sigma|W_ParamConfidenceInterval|W_AutoPeakInfo)$/

const sjis =
  typeof TextDecoder !== 'undefined'
    ? new TextDecoder('shift_jis', { fatal: false })
    : null
const latin1 =
  typeof TextDecoder !== 'undefined' ? new TextDecoder('latin1') : null

function decodeName(bytes: Uint8Array): string {
  let end = 0
  while (end < bytes.length && bytes[end] !== 0) end++
  const slice = bytes.subarray(0, end)
  // Wave names may be Shift-JIS (Japanese); fall back to latin1.
  if (sjis) return sjis.decode(slice)
  if (latin1) return latin1.decode(slice)
  return String.fromCharCode(...slice)
}

function readData(
  dv: DataView,
  bytes: Uint8Array,
  type: number,
  dataOff: number,
  npnts: number,
): number[] {
  const ps = pointSize(type)
  const out: number[] = []
  if (ps <= 0 || dataOff + npnts * ps > bytes.length) return out
  for (let i = 0; i < npnts; i++) {
    const o = dataOff + i * ps
    if (type & 4) out.push(dv.getFloat64(o, true))
    else if (type & 2) out.push(dv.getFloat32(o, true))
    else if (type & 0x10) out.push(dv.getInt16(o, true))
    else if (type & 0x20) out.push(dv.getInt32(o, true))
    else if (type & 8) out.push(dv.getInt8(o))
    else out.push(NaN)
  }
  return out
}

/** Parse a .pxp ArrayBuffer into importable traces. */
export function parsePxp(buffer: ArrayBuffer): PxpImportResult {
  const bytes = new Uint8Array(buffer)
  const dv = new DataView(buffer)

  const waves = new Map<string, RawWave>()
  let macro = ''
  let off = 0
  while (off + 8 <= bytes.length) {
    const recordType = dv.getUint16(off, true) & 0x7fff
    const numDataBytes = dv.getInt32(off + 4, true)
    if (numDataBytes < 0 || off + 8 + numDataBytes > bytes.length) break
    const d = off + 8
    if (recordType === 4 || recordType === 5) {
      macro +=
        (latin1
          ? latin1.decode(bytes.subarray(d, d + numDataBytes))
          : String.fromCharCode(...bytes.subarray(d, d + numDataBytes))) + '\n'
    } else if (recordType === 3) {
      const ver = dv.getInt16(d, true)
      if (ver === 2) {
        const WH = d + 16
        const type = dv.getInt16(WH, true)
        const name = decodeName(bytes.subarray(WH + 6, WH + 26))
        const npnts = dv.getInt32(WH + 42, true)
        const sfA = dv.getFloat64(WH + 48, true)
        const sfB = dv.getFloat64(WH + 56, true)
        const data = readData(dv, bytes, type, WH + 110, npnts)
        if (name) waves.set(name, { name, npnts, data, sfA, sfB })
      } else if (ver === 5) {
        const WH = d + 64
        const type = dv.getInt16(WH + 16, true)
        const name = decodeName(bytes.subarray(WH + 28, WH + 60))
        const npnts = dv.getInt32(WH + 12, true)
        const sfA = dv.getFloat64(WH + 84, true)
        const sfB = dv.getFloat64(WH + 116, true)
        const data = readData(dv, bytes, type, WH + 320, npnts)
        if (name) waves.set(name, { name, npnts, data, sfA, sfB })
      }
    }
    off += 8 + numDataBytes
  }

  // X/Y pairing + X-wave set from the Display / AppendToGraph macros.
  const yToX = new Map<string, string>()
  const xNames = new Set<string>()
  const re =
    /((?:'[^']+'|[A-Za-z_][\w]*)(?:\s*,\s*(?:'[^']+'|[A-Za-z_][\w]*))*)\s+vs\s+('[^']+'|[A-Za-z_][\w]*)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(macro))) {
    const x = m[2].replace(/'/g, '')
    xNames.add(x)
    for (const y of m[1].split(',').map((s) => s.trim().replace(/'/g, ''))) {
      if (y) yToX.set(y, x)
    }
  }

  // Fallback X by matching length (for data waves not named in a macro).
  const xByLen = new Map<number, string>()
  for (const xn of xNames) {
    const w = waves.get(xn)
    if (w && !xByLen.has(w.npnts)) xByLen.set(w.npnts, xn)
  }

  // Build traces = data Y waves, paired to a same-length X. Exclude X waves and
  // analysis artifacts (facts only).
  const traces: Trace[] = []
  let skipped = 0
  const seen = new Set<string>()
  for (const [name, w] of waves) {
    if (xNames.has(name) || ARTIFACT.test(name)) continue
    if (w.npnts < 2) {
      skipped++
      continue
    }
    const xn = yToX.get(name) ?? xByLen.get(w.npnts)
    const xw = xn ? waves.get(xn) : undefined
    let x: number[]
    if (xw && xw.npnts === w.npnts) {
      x = xw.data.slice()
    } else if (
      Number.isFinite(w.sfA) &&
      w.sfA !== 0 &&
      (w.sfA !== 1 || w.sfB !== 0)
    ) {
      // No separate X wave — use the wave's own Igor SetScale.
      x = Array.from({ length: w.npnts }, (_, i) => w.sfB + i * w.sfA)
    } else {
      skipped++
      continue
    }
    let id = name
    let n = 1
    while (seen.has(id)) id = `${name}-${n++}`
    seen.add(id)
    traces.push({
      id,
      name,
      x,
      y: w.data.slice(),
      color: TRACE_COLORS[traces.length % TRACE_COLORS.length],
      visible: true,
      lineWidth: DEFAULT_LINE_WIDTH,
    })
  }

  return { traces, type: detectType(macro, traces), skipped }
}

/**
 * Measurement type from the bottom-axis label, falling back to the X range
 * (PL ≈ wavelength nm ≳ 1000; Raman ≈ 100–1000 cm⁻¹; XRD ≈ 2θ < 100°).
 */
function detectType(macro: string, traces: Trace[]): MeasurementType | null {
  const label = (macro.match(/Label bottom "([^"]*)"/) || [])[1] || ''
  if (/wavelength|nm/i.test(label)) return 'PL'
  if (/raman|cm/i.test(label)) return 'Raman'
  if (/2theta|theta|omega|deg|2θ/i.test(label)) return 'XRD'
  if (traces.length === 0) return null
  let lo = Infinity
  let hi = -Infinity
  for (const v of traces[0].x) {
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  if (!Number.isFinite(hi)) return null
  if (hi < 100) return 'XRD'
  if (hi < 1000) return 'Raman'
  return 'PL'
}

export async function parsePxpFile(file: File): Promise<PxpImportResult> {
  return parsePxp(await file.arrayBuffer())
}
