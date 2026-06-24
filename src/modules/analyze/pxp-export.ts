import type { Trace } from './types'

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
  for (let i = 0; i < cr.length; i++) out[i] = cr.charCodeAt(i) & 0xff
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
}

/** Sanitize to a classic Igor identifier that is safe in Binary Wave v2. */
function igorName(name: string, fallback: string): string {
  const ascii = name
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '')
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

function buildExportTraces(traces: Trace[]): {
  exportTraces: ExportTrace[]
  commonXName: string | null
} {
  const usable = traces.filter((t) => t.x.length === t.y.length && t.y.length >= 2)
  const used = new Set<string>()
  if (usable.length === 0) return { exportTraces: [], commonXName: null }

  const hasCommonX = usable.every((t) => sameX(t.x, usable[0].x))
  const commonXName = hasCommonX ? uniqueName('xx', used) : null
  const exportTraces: ExportTrace[] = []

  for (let i = 0; i < usable.length; i++) {
    const trace = usable[i]
    const baseY = igorName(trace.name, `wave${i}`)
    const xName = commonXName ?? uniqueName(igorName(`x_${baseY}`, `x${i}`), used)
    const yName = uniqueName(baseY, used)
    exportTraces.push({ trace, xName, yName })
  }

  return { exportTraces, commonXName }
}

function historyRecord(exportTraces: ExportTrace[]): Uint8Array {
  const names = exportTraces.map((t) => `${t.yName} vs ${t.xName}`).join('; ')
  return textRecord(`Created by lab-tools Igor .pxp export\rWaves: ${names}\r`)
}

function recreationRecord(exportTraces: ExportTrace[]): Uint8Array {
  if (exportTraces.length === 0) {
    return textRecord('// Platform=Macintosh, IGORVersion=4.091\r')
  }

  const [first, ...rest] = exportTraces
  const lines = [
    '// Platform=Macintosh, IGORVersion=4.091',
    'Silent 101 // use | as bitwise or -- not comment.',
    '',
    'Graph0()',
    '',
    'Window Graph0() : Graph',
    '\tPauseUpdate; Silent 1\t\t// building window...',
    `\tDisplay /W=(50,50,560,420) ${first.yName} vs ${first.xName}`,
    ...rest.map((t) => `\tAppendToGraph ${t.yName} vs ${t.xName}`),
    '\tModifyGraph tick=2,mirror=1,fSize=25,axThick=2,font="Times New Roman"',
    '\tLabel left "Intensity (a.u.)"',
    '\tLabel bottom "X"',
    'EndMacro',
    '',
  ]
  return textRecord(lines.join('\r'))
}

/** Serialize the given traces into a .pxp Blob (a minimal Igor-4 experiment). */
export function buildPxp(traces: Trace[]): Blob {
  const chunks: Uint8Array[] = []
  const { exportTraces, commonXName } = buildExportTraces(traces)
  if (exportTraces.length === 0) {
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
  if (commonXName && exportTraces[0]) {
    chunks.push(packRecord(REC_WAVE, buildWaveV2(commonXName, exportTraces[0].trace.x)))
    for (const t of exportTraces) {
      chunks.push(packRecord(REC_WAVE, buildWaveV2(t.yName, t.trace.y)))
    }
  } else {
    for (const t of exportTraces) {
      chunks.push(packRecord(REC_WAVE, buildWaveV2(t.xName, t.trace.x)))
      chunks.push(packRecord(REC_WAVE, buildWaveV2(t.yName, t.trace.y)))
    }
  }

  // Recreation + procedure close the experiment like an Igor-authored file.
  chunks.push(packRecord(REC_RECREATION, recreationRecord(exportTraces)))
  chunks.push(packRecord(REC_GETHISTORY, new Uint8Array(0)))
  chunks.push(
    packRecord(
      REC_PROCEDURE,
      textRecord('#pragma rtGlobals=1\t\t// Use modern global access method.\r'),
    ),
  )

  return new Blob(chunks as BlobPart[], { type: 'application/octet-stream' })
}
