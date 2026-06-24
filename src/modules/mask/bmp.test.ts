import { describe, it, expect } from 'vitest'
import { encodeOneBitBmp } from './bmp'

function dv(bmp: Uint8Array): DataView {
  return new DataView(bmp.buffer, bmp.byteOffset, bmp.byteLength)
}

describe('encodeOneBitBmp', () => {
  it('writes a valid 1-bit BMP header', () => {
    const bmp = encodeOneBitBmp(16, 4, () => true)
    const v = dv(bmp)
    expect(bmp[0]).toBe(0x42) // 'B'
    expect(bmp[1]).toBe(0x4d) // 'M'
    expect(v.getUint32(10, true)).toBe(62) // pixel data offset = 14+40+8
    expect(v.getUint32(14, true)).toBe(40) // BITMAPINFOHEADER size
    expect(v.getInt32(18, true)).toBe(16) // width
    expect(v.getInt32(22, true)).toBe(4) // height
    expect(v.getUint16(26, true)).toBe(1) // planes
    expect(v.getUint16(28, true)).toBe(1) // bit depth
  })

  it('rows are padded to a 4-byte stride', () => {
    // width 33 ⇒ ((33+31)>>5)<<2 = 8 bytes/row
    const bmp = encodeOneBitBmp(33, 1, () => false)
    const v = dv(bmp)
    expect(v.getUint32(2, true)).toBe(62 + 8) // fileSize = header + 8-byte row
    expect(v.getUint32(34, true)).toBe(8) // biSizeImage
  })

  it('packs a set bit (white) per pixel, MSB-first', () => {
    // x<4 white, x≥4 black ⇒ first byte 0b11110000 = 0xF0
    const bmp = encodeOneBitBmp(8, 1, (x) => x < 4)
    expect(bmp[62]).toBe(0xf0)
  })

  it('a 14 µm feature at 1920px / 474µm-wide field is ~57 px', () => {
    // umPerPx = 474/1920; 14µm / umPerPx ≈ 56.7 px
    const umPerPx = 474 / 1920
    expect(Math.round(14 / umPerPx)).toBe(57)
  })
})
