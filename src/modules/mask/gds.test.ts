import { describe, expect, it } from 'vitest'
import { defaultCalibration } from './calibration'
import type { MaskDocument } from './document'
import { encodeGds } from './gds'

interface GdsRecord {
  type: number
  dataType: number
  data: Uint8Array
}

function records(bytes: Uint8Array): GdsRecord[] {
  const out: GdsRecord[] = []
  for (let i = 0; i < bytes.length;) {
    const len = (bytes[i] << 8) | bytes[i + 1]
    out.push({
      type: bytes[i + 2],
      dataType: bytes[i + 3],
      data: bytes.slice(i + 4, i + len),
    })
    i += len
  }
  return out
}

function int32s(bytes: Uint8Array): number[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const out: number[] = []
  for (let i = 0; i < bytes.byteLength; i += 4) {
    out.push(view.getInt32(i, false))
  }
  return out
}

describe('encodeGds', () => {
  it('writes a valid GDS library skeleton', () => {
    const cal = defaultCalibration()
    const doc: MaskDocument = {
      id: 'mask-test',
      name: 'test mask',
      widthUm: cal.substrateWUm,
      heightUm: cal.substrateHUm,
      magnification: cal.magnification,
      umPerCm: cal.umPerCm,
      target: 'gds',
      shapes: [],
      polarity: 'darkOnLight',
    }

    const gds = encodeGds(doc, cal)
    const rs = records(gds)

    expect(rs[0]).toMatchObject({ type: 0x00, dataType: 0x02 }) // HEADER
    expect(rs.at(-1)).toMatchObject({ type: 0x04, dataType: 0x00 }) // ENDLIB
    expect(rs.some((r) => r.type === 0x03 && r.dataType === 0x05)).toBe(true) // UNITS
  })

  it('exports rectangle geometry in µm with a lower-left GDS origin', () => {
    const cal = defaultCalibration()
    const doc: MaskDocument = {
      id: 'mask-rect',
      name: 'rect',
      widthUm: cal.substrateWUm,
      heightUm: cal.substrateHUm,
      magnification: cal.magnification,
      umPerCm: cal.umPerCm,
      target: 'gds',
      shapes: [
        {
          id: 'r1',
          kind: 'rect',
          x: 10,
          y: 20,
          w: 30,
          h: 40,
        },
      ],
      polarity: 'darkOnLight',
    }

    const xy = records(encodeGds(doc, cal)).find((r) => r.type === 0x10)
    expect(xy).toBeDefined()
    expect(int32s(xy!.data)).toEqual([
      10_000,
      Math.round((cal.substrateHUm - 20) * 1000),
      40_000,
      Math.round((cal.substrateHUm - 20) * 1000),
      40_000,
      Math.round((cal.substrateHUm - 60) * 1000),
      10_000,
      Math.round((cal.substrateHUm - 60) * 1000),
      10_000,
      Math.round((cal.substrateHUm - 20) * 1000),
    ])
  })
})
