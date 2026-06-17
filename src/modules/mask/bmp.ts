// Port of /Users/nao/Desktop/MCC-swift/Sources/BMPProcessor.swift makeOneBitBMP.
// 1-bit BMP. file header 14B + BITMAPINFOHEADER 40B + palette 8B
// (index0=black 0,0,0,0 ; index1=white 255,255,255,0).
// biBitCount=1, biPlanes=1, biCompression=0, X/Y res = 2835. rows BOTTOM-UP.
// row stride = ((width+31)>>5)<<2 bytes.
// bit packing within a byte: byte |= 0x80 >> (x & 7). A set bit (1) selects
// palette index1 = WHITE. So isWhite(x,y)===true -> set bit. little-endian.
export function encodeOneBitBmp(
  width: number,
  height: number,
  isWhite: (x: number, y: number) => boolean
): Uint8Array {
  const outputBytesPerRow = ((width + 31) >> 5) << 2
  const pixelDataSize = outputBytesPerRow * height
  const paletteSize = 8
  const pixelOffset = 14 + 40 + paletteSize
  const fileSize = pixelOffset + pixelDataSize

  const data = new Uint8Array(fileSize)
  const view = new DataView(data.buffer)
  let p = 0

  const u16 = (value: number) => {
    view.setUint16(p, value & 0xffff, true)
    p += 2
  }
  const u32 = (value: number) => {
    view.setUint32(p, value >>> 0, true)
    p += 4
  }
  const i32 = (value: number) => {
    view.setInt32(p, value | 0, true)
    p += 4
  }

  // File header (14 bytes)
  data[p++] = 0x42 // 'B'
  data[p++] = 0x4d // 'M'
  u32(fileSize)
  u16(0) // reserved1
  u16(0) // reserved2
  u32(pixelOffset)

  // BITMAPINFOHEADER (40 bytes)
  u32(40) // biSize
  i32(width) // biWidth
  i32(height) // biHeight (positive = bottom-up)
  u16(1) // biPlanes
  u16(1) // biBitCount
  u32(0) // biCompression = BI_RGB
  u32(pixelDataSize) // biSizeImage
  i32(2835) // biXPelsPerMeter
  i32(2835) // biYPelsPerMeter
  u32(2) // biClrUsed
  u32(0) // biClrImportant

  // Palette (8 bytes): index0 = black, index1 = white. BGRA order, reserved=0.
  data[p++] = 0 // black B
  data[p++] = 0 // black G
  data[p++] = 0 // black R
  data[p++] = 0 // reserved
  data[p++] = 255 // white B
  data[p++] = 255 // white G
  data[p++] = 255 // white R
  data[p++] = 0 // reserved

  // Pixel data: rows bottom-up.
  for (let y = height - 1; y >= 0; y--) {
    const rowStart = p
    for (let x = 0; x < width; x++) {
      if (isWhite(x, y)) {
        data[rowStart + (x >> 3)] |= 0x80 >> (x & 7)
      }
    }
    p += outputBytesPerRow
  }

  return data
}
