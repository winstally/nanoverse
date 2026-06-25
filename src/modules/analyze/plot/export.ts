import { downloadBlob } from '@/lib/download'

function serializeSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement
  // Strip UI-only chrome (e.g. the legend resize handle) from exports.
  clone.querySelectorAll('[data-noexport]').forEach((n) => n.remove())
  if (!clone.getAttribute('xmlns')) {
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  }
  if (!clone.getAttribute('xmlns:xlink')) {
    clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')
  }
  return new XMLSerializer().serializeToString(clone)
}

export async function exportPng(
  svg: SVGSVGElement,
  filename: string,
  scale = 2,
): Promise<void> {
  const source = serializeSvg(svg)

  // Determine intrinsic size from width/height attrs or the viewBox.
  let width = parseFloat(svg.getAttribute('width') || '')
  let height = parseFloat(svg.getAttribute('height') || '')
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    const viewBox = svg.getAttribute('viewBox')
    if (viewBox) {
      const parts = viewBox.split(/[\s,]+/).map(Number)
      if (parts.length === 4) {
        width = parts[2]
        height = parts[3]
      }
    }
  }
  if (!Number.isFinite(width) || width <= 0) width = svg.clientWidth || 800
  if (!Number.isFinite(height) || height <= 0) height = svg.clientHeight || 600

  const svgBlob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' })
  const svgUrl = URL.createObjectURL(svgBlob)

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('Failed to load SVG for PNG export'))
      image.src = svgUrl
    })

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context unavailable')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    const pngBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/png')
    })
    if (!pngBlob) throw new Error('Failed to encode PNG')

    downloadBlob(pngBlob, filename)
  } finally {
    URL.revokeObjectURL(svgUrl)
  }
}
