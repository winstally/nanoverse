import {
  DEFAULT_LEGEND,
  DEFAULT_LINE_WIDTH,
  type LegendLayout,
  type Trace,
} from './types'

/**
 * Igor Pro packed-experiment (.pxp) writer.
 *
 * Produces a small Igor-4-style experiment with explicit X and Y waves:
 * empty desktop markers, variables/history records, Binary Wave v2 records,
 * then recreation/procedure records. Igor-authored spectroscopy projects use
 * a real X wave (commonly `xx`) and graph macros like `Display y vs xx`; doing
 * the same avoids relying on `SetScale` and makes the exported file reopen as a
 * visible graph, not just a hidden data wave.
 */

// Igor packed-file record types (PackedFileRecordType).
const REC_VARIABLES = 1
const REC_HISTORY = 2
const REC_WAVE = 3
const REC_RECREATION = 4
const REC_PROCEDURE = 5
const REC_GETHISTORY = 7
const REC_PLATFORM = 11 // Igor-4 desktop markers (Misc_Start / Misc_End)

// IGOR version stamp embedded in the desktop markers: 0x0ffb = 4091 → 4.091.
const IGOR_VERSION = 0x0ffb

/** Wrap a record body in an 8-byte PackedFileRecordHeader. */
function packRecord(type: number, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + data.length)
  const dv = new DataView(out.buffer)
  dv.setUint16(0, type, true) // recordType
  dv.setInt16(2, 0, true) // version
  dv.setInt32(4, data.length, true) // numDataBytes
  out.set(data, 8)
  return out
}

/** A 52-byte desktop marker record (Misc_Start / Misc_End), byte-for-byte as Igor 4 writes it. */
function miscRecord(name: 'Misc_Start' | 'Misc_End'): Uint8Array {
  const d = new Uint8Array(52)
  const dv = new DataView(d.buffer)
  dv.setUint16(0, 16, true)
  dv.setUint16(2, 16, true)
  for (let i = 0; i < name.length; i++) d[4 + i] = name.charCodeAt(i)
  dv.setUint16(40, IGOR_VERSION, true)
  return d
}

/** Igor stores procedure / recreation text with CR line endings. */
function textRecord(text: string): Uint8Array {
  const cr = text.replace(/\n/g, '\r')
  const out = new Uint8Array(cr.length)
  for (let i = 0; i < cr.length; i++) {
    const code = cr.charCodeAt(i)
    out[i] =
      code === 9 || code === 13 || (code >= 0x20 && code <= 0x7e) ? code : 0x3f
  }
  return out
}

/** Minimal numeric/string variables record (VarHeader1: 0 of each). */
function variablesRecord(): Uint8Array {
  const d = new Uint8Array(8)
  const dv = new DataView(d.buffer)
  dv.setInt16(0, 1, true) // version
  dv.setInt16(2, 0, true) // numSysVars
  dv.setInt16(4, 0, true) // numUserVars
  dv.setInt16(6, 0, true) // numUserStrs
  return d
}

const IGOR_V2_NAME_MAX = 18

interface ExportTrace {
  trace: Trace
  xName: string
  yName: string
  includeInLegend: boolean
  lineStyle?: number
}

export interface PxpOverlay {
  name: string
  x: number[]
  y: number[]
  color?: string
  lineWidth?: number
  includeInLegend?: boolean
  /** Igor lStyle number. 3 is a dashed line in Igor Pro 4. */
  lineStyle?: number
}

export interface PxpExportOptions {
  xLabel?: string
  yLabel?: string
  xMin?: number
  xMax?: number
  yMin?: number
  yMax?: number
  xLog?: boolean
  yLog?: boolean
  legend?: LegendLayout
  overlays?: PxpOverlay[]
  verticalLines?: number[]
  verticalLineLabel?: string
}

const IGOR_PLOT_SIDE_ESTIMATE = 560

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

function asciiIgorText(text: string, fallback: string): string {
  const translated = text
    .replace(/共振/g, ' resonance')
    .replace(/強度/g, 'Intensity')
    .replace(/波長/g, 'Wavelength')
    .replace(/θ/g, 'theta')
    .replace(/Θ/g, 'Theta')
    .replace(/[µμ]/g, 'u')
    .replace(/°/g, 'deg')
    .replace(/⁻¹/g, '^-1')
    .replace(/⁻²/g, '^-2')
    .replace(/⁻³/g, '^-3')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/¹/g, '^1')
    .replace(/⁻/g, '-')
    .replace(/[−–—]/g, '-')
    .replace(/×/g, 'x')
  const ascii = translated
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return ascii || fallback
}

/** Sanitize to a classic Igor identifier that is safe in Binary Wave v2. */
function igorName(name: string, fallback: string): string {
  const ascii = asciiIgorText(name, fallback)
    .replace(/[^A-Za-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
  const withInitial = /^[A-Za-z_]/.test(ascii) ? ascii : `w_${ascii}`
  return (withInitial || fallback).slice(0, IGOR_V2_NAME_MAX)
}

function uniqueName(base: string, used: Set<string>): string {
  let name = base.slice(0, IGOR_V2_NAME_MAX)
  let i = 1
  while (used.has(name)) {
    const suffix = `_${i++}`
    name = `${base.slice(0, IGOR_V2_NAME_MAX - suffix.length)}${suffix}`
  }
  used.add(name)
  return name
}

function sameX(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) return false
  }
  return true
}

function igorNumber(v: number): string {
  if (!Number.isFinite(v)) return '0'
  return Number(v.toPrecision(12)).toString()
}

function escapeIgorString(s: string, fallback: string): string {
  return asciiIgorText(s, fallback)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, ' ')
}

function macroName(name: string): string {
  if (/^[A-Za-z_]\w*$/.test(name)) return name
  return `'${name.replace(/'/g, "''")}'`
}

function hexToIgorRgb(color: string): [number, number, number] {
  const m = color.trim().match(/^#?([0-9a-f]{6})$/i)
  if (!m) return [0, 0, 0]
  const n = Number.parseInt(m[1], 16)
  return [((n >> 16) & 0xff) * 257, ((n >> 8) & 0xff) * 257, (n & 0xff) * 257]
}

function sanitizeTraceForDisplayAxes(
  trace: Trace,
  options: PxpExportOptions,
): Trace {
  const x = trace.x.slice()
  const y = trace.y.slice()
  let changed = false
  const n = Math.min(x.length, y.length)
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(x[i]) || (options.xLog && x[i] <= 0)) {
      x[i] = NaN
      changed = true
    }
    if (!Number.isFinite(y[i]) || (options.yLog && y[i] <= 0)) {
      y[i] = NaN
      changed = true
    }
  }
  return changed ? { ...trace, x, y } : trace
}

/** Build one Igor Binary Wave v2 record body (double, with optional X scaling). */
function buildWaveV2(
  name: string,
  values: number[],
  hsA = 1,
  hsB = 0,
): Uint8Array {
  const npnts = values.length
  const PT = 8 // NT_FP64
  const WH = 16 // WaveHeader2 starts after BinHeader2 (16 bytes)
  const headerBytes = WH + 110 // BinHeader2 + WaveHeader2 up to wData
  // Igor's own v2 records carry 16 trailing zero bytes (the wData[4] reserve)
  // after the data, and wfmSize counts the full 126-byte WaveHeader2 + data.
  // Matching this exactly is required or Igor rejects the wave ("bad entry").
  const total = headerBytes + npnts * PT + 16
  const buf = new ArrayBuffer(total)
  const dv = new DataView(buf)
  const u8 = new Uint8Array(buf)

  // BinHeader2
  dv.setInt16(0, 2, true) // version
  dv.setInt32(2, 126 + npnts * PT, true) // wfmSize = sizeof(WaveHeader2) + data
  dv.setInt32(6, 0, true) // noteSize
  dv.setInt32(10, 0, true) // pictSize
  // checksum (offset 14) filled in last.

  // WaveHeader2
  dv.setInt16(WH + 0, 4, true) // type = NT_FP64 (double)
  dv.setInt32(WH + 2, 0, true) // next (filler)
  const nm = name.slice(0, IGOR_V2_NAME_MAX)
  for (let i = 0; i < nm.length; i++) u8[WH + 6 + i] = nm.charCodeAt(i) & 0x7f
  dv.setInt32(WH + 42, npnts, true) // npnts
  dv.setFloat64(WH + 48, hsA, true) // hsA = x step
  dv.setFloat64(WH + 56, hsB, true) // hsB = x start
  dv.setInt16(WH + 68, 0, true) // fsValid = 0

  // Wave data (at WH+110)
  let o = WH + 110
  for (let i = 0; i < npnts; i++) {
    dv.setFloat64(o, values[i], true)
    o += 8
  }

  // Checksum: the sum of all int16 words over BinHeader2 (16) + WaveHeader2
  // (126, incl. the 16-byte wData[4] = first 2 doubles of data) must be 0.
  const cksumEnd = WH + 126 // 16 + 126 = 142
  let sum = 0
  for (let i = 0; i < cksumEnd; i += 2) sum = (sum + dv.getInt16(i, true)) & 0xffff
  dv.setInt16(14, ((-sum) << 16) >> 16, true)
  return u8
}

function buildExportTraces(
  traces: Trace[],
  options: PxpExportOptions,
): {
  exportTraces: ExportTrace[]
  commonXName: string | null
  commonX: number[] | null
} {
  const usable = traces
    .filter((t) => t.x.length === t.y.length && t.y.length >= 2)
    .map((t) => sanitizeTraceForDisplayAxes(t, options))
  const used = new Set<string>()
  if (usable.length === 0) {
    return { exportTraces: [], commonXName: null, commonX: null }
  }

  const hasCommonX = usable.every((t) => sameX(t.x, usable[0].x))
  const commonXName = hasCommonX ? uniqueName('xx', used) : null
  const commonX = commonXName ? usable[0].x : null
  const exportTraces: ExportTrace[] = []

  for (let i = 0; i < usable.length; i++) {
    const trace = usable[i]
    const baseY = igorName(trace.name, `wave${i}`)
    const xName = commonXName ?? uniqueName(igorName(`x_${baseY}`, `x${i}`), used)
    const yName = uniqueName(baseY, used)
    exportTraces.push({ trace, xName, yName, includeInLegend: true })
  }

  return { exportTraces, commonXName, commonX }
}

function buildOverlayTraces(
  overlays: PxpOverlay[],
  usedNames: Set<string>,
  options: PxpExportOptions,
): ExportTrace[] {
  const exportTraces: ExportTrace[] = []
  for (let i = 0; i < overlays.length; i++) {
    const overlay = overlays[i]
    if (overlay.x.length !== overlay.y.length || overlay.y.length < 2) continue
    const base = igorName(overlay.name, `fit_${i}`)
    const yName = uniqueName(base.startsWith('fit_') ? base : `fit_${base}`, usedNames)
    const xName = uniqueName(igorName(`x_${yName}`, `fit_x${i}`), usedNames)
    exportTraces.push({
      trace: sanitizeTraceForDisplayAxes({
        id: yName,
        name: overlay.name,
        x: overlay.x,
        y: overlay.y,
        color: overlay.color ?? '#5b6470',
        visible: true,
        lineWidth: overlay.lineWidth ?? 2,
      }, options),
      xName,
      yName,
      includeInLegend: overlay.includeInLegend ?? false,
      lineStyle: overlay.lineStyle,
    })
  }
  return exportTraces
}

function buildVerticalLineOverlay(
  options: PxpExportOptions,
): PxpOverlay | null {
  const xs =
    options.verticalLines?.filter((v) => Number.isFinite(v) && (!options.xLog || v > 0)) ??
    []
  const yMin = options.yMin as number
  const yMax = options.yMax as number
  if (
    xs.length === 0 ||
    !Number.isFinite(yMin) ||
    !Number.isFinite(yMax) ||
    (options.yLog && yMax <= 0)
  ) {
    return null
  }
  const y0 = options.yLog && yMin <= 0 ? Math.max(yMax / 1e6, 1e-300) : yMin
  const x: number[] = []
  const y: number[] = []
  for (const vx of xs) {
    x.push(vx, vx, NaN)
    y.push(y0, yMax, NaN)
  }
  return {
    name: asciiIgorText(options.verticalLineLabel ?? 'markers', 'markers'),
    x,
    y,
    color: '#16a34a',
    lineWidth: 2,
    includeInLegend: !!options.verticalLineLabel,
  }
}

function historyRecord(exportTraces: ExportTrace[]): Uint8Array {
  const names = exportTraces.map((t) => `${t.yName} vs ${t.xName}`).join('; ')
  return textRecord(`Created by lab-tools Igor .pxp export\rWaves: ${names}\r`)
}

function legendPosition(
  exportTraces: ExportTrace[],
  legend: LegendLayout,
): { x: number; y: number } {
  const labels = exportTraces
    .filter((t) => t.includeInLegend)
    .map((t) => asciiIgorText(t.trace.name, t.yName))
  const fontSize = Math.max(8, Math.round(25 * legend.scale))
  const boxW =
    labels.length > 0
      ? Math.max(...labels.map((label) => label.length * fontSize * 0.52)) +
        fontSize * 2.4
      : 0
  const boxH = labels.length * fontSize * 1.35 + fontSize * 0.6
  const maxX = Math.max(0, 1 - boxW / IGOR_PLOT_SIDE_ESTIMATE)
  const maxY = Math.max(0, 1 - boxH / IGOR_PLOT_SIDE_ESTIMATE)
  return {
    x: clamp(legend.x, 0, maxX),
    y: clamp(legend.y, 0, maxY),
  }
}

function recreationRecord(
  exportTraces: ExportTrace[],
  options: PxpExportOptions,
): Uint8Array {
  if (exportTraces.length === 0) {
    return textRecord('// Platform=Macintosh, IGORVersion=4.091\r')
  }

  const [first, ...rest] = exportTraces
  const xLabel = escapeIgorString(options.xLabel ?? 'X', 'X')
  const yLabel = escapeIgorString(options.yLabel ?? 'Intensity (a.u.)', 'Intensity (a.u.)')
  const legend = options.legend ?? DEFAULT_LEGEND
  const legendSize = Math.max(8, Math.round(25 * legend.scale))
  const legendEntries = exportTraces.filter((t) => t.includeInLegend).map((t) => {
    const label = escapeIgorString(t.trace.name, t.yName)
    return `\\s(${macroName(t.yName)}) ${label}`
  })
  const legendPos = legendPosition(exportTraces, legend)
  const legendText = `\\Z${legendSize}${legendEntries.join('\\r')}`
  const lines = [
    '// Platform=Macintosh, IGORVersion=4.091',
    'Silent 101 // use | as bitwise or -- not comment.',
    '',
    'Graph0()',
    '',
    'Window Graph0() : Graph',
    '\tPauseUpdate; Silent 1\t\t// building window...',
    `\tDisplay /W=(50,50,560,420) ${macroName(first.yName)} vs ${macroName(first.xName)}`,
    ...rest.map(
      (t) => `\tAppendToGraph ${macroName(t.yName)} vs ${macroName(t.xName)}`,
    ),
    '\tModifyGraph tick=2,mirror=1,fSize=25,axThick=2,font="Times New Roman"',
    ...(options.xLog ? ['\tModifyGraph log(bottom)=1'] : []),
    ...(options.yLog ? ['\tModifyGraph log(left)=1'] : []),
    ...exportTraces.map((t) => {
      const [r, g, b] = hexToIgorRgb(t.trace.color)
      const lw = t.trace.lineWidth ?? DEFAULT_LINE_WIDTH
      const name = macroName(t.yName)
      const style = t.lineStyle === undefined ? '' : `,lStyle(${name})=${t.lineStyle}`
      return `\tModifyGraph lSize(${name})=${igorNumber(lw)},rgb(${name})=(${r},${g},${b})${style}`
    }),
    ...(Number.isFinite(options.xMin) && Number.isFinite(options.xMax)
      ? [`\tSetAxis bottom ${igorNumber(options.xMin as number)},${igorNumber(options.xMax as number)}`]
      : []),
    ...(Number.isFinite(options.yMin) && Number.isFinite(options.yMax)
      ? [`\tSetAxis left ${igorNumber(options.yMin as number)},${igorNumber(options.yMax as number)}`]
      : []),
    `\tLabel left "${yLabel}"`,
    `\tLabel bottom "${xLabel}"`,
    ...(legend.visible && legendEntries.length > 0
      ? [
          `\tLegend/N=text0/J/A=LT/X=${igorNumber(legendPos.x * 100)}/Y=${igorNumber(
            legendPos.y * 100,
          )} "${legendText}"`,
        ]
      : []),
    'EndMacro',
    '',
  ]
  return textRecord(lines.join('\r'))
}

/** Serialize the given traces into a .pxp Blob (a minimal Igor-4 experiment). */
export function buildPxp(traces: Trace[], options: PxpExportOptions = {}): Blob {
  const chunks: Uint8Array[] = []
  const data = buildExportTraces(traces, options)
  const usedNames = new Set<string>()
  for (const t of data.exportTraces) {
    usedNames.add(t.xName)
    usedNames.add(t.yName)
  }
  const verticalLineOverlay = buildVerticalLineOverlay(options)
  const overlayTraces = buildOverlayTraces(
    [...(options.overlays ?? []), ...(verticalLineOverlay ? [verticalLineOverlay] : [])],
    usedNames,
    options,
  )
  const exportTraces = [...data.exportTraces, ...overlayTraces]
  if (data.exportTraces.length === 0) {
    throw new Error('No exportable traces')
  }

  // Empty desktop block + variables/history mirrors the stable record order of
  // Igor-authored packed experiments while leaving platform-specific window
  // state out of the file.
  chunks.push(packRecord(REC_PLATFORM, miscRecord('Misc_Start')))
  chunks.push(packRecord(REC_PLATFORM, miscRecord('Misc_End')))
  chunks.push(packRecord(REC_VARIABLES, variablesRecord()))
  chunks.push(packRecord(REC_HISTORY, historyRecord(exportTraces)))

  // Wave records: explicit X wave(s) first, then measured Y waves.
  if (data.commonXName && data.commonX) {
    chunks.push(packRecord(REC_WAVE, buildWaveV2(data.commonXName, data.commonX)))
  }
  for (const t of exportTraces) {
    if (t.xName !== data.commonXName) {
      chunks.push(packRecord(REC_WAVE, buildWaveV2(t.xName, t.trace.x)))
    }
    chunks.push(packRecord(REC_WAVE, buildWaveV2(t.yName, t.trace.y)))
  }

  // Recreation + procedure close the experiment like an Igor-authored file.
  chunks.push(packRecord(REC_RECREATION, recreationRecord(exportTraces, options)))
  chunks.push(packRecord(REC_GETHISTORY, new Uint8Array(0)))
  chunks.push(
    packRecord(
      REC_PROCEDURE,
      textRecord('#pragma rtGlobals=1\t\t// Use modern global access method.\r'),
    ),
  )

  return new Blob(chunks as BlobPart[], { type: 'application/octet-stream' })
}
