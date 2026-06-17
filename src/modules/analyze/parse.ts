import { Trace, TRACE_COLORS, DEFAULT_LINE_WIDTH } from './types'

function stripExtension(fileName: string): string {
  const slash = Math.max(fileName.lastIndexOf('/'), fileName.lastIndexOf('\\'))
  const base = slash >= 0 ? fileName.slice(slash + 1) : fileName
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(0, dot) : base
}

export function parseSpectrumText(
  text: string,
  fileName: string,
): { x: number[]; y: number[]; name: string } {
  const x: number[] = []
  const y: number[] = []
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.length === 0) continue
    const tokens = trimmed.split(/\t|\s*,\s*|\s+/)
    if (tokens.length < 2) continue
    const a = Number(tokens[0])
    const b = Number(tokens[1])
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue
    x.push(a)
    y.push(b)
  }
  return { x, y, name: stripExtension(fileName) }
}

export async function parseFiles(files: File[] | FileList): Promise<Trace[]> {
  const list = Array.from(files)
  const traces: Trace[] = []
  for (let i = 0; i < list.length; i++) {
    const file = list[i]
    const text = await file.text()
    const { x, y, name } = parseSpectrumText(text, file.name)
    traces.push({
      id: `${name}-${i}`,
      name,
      x,
      y,
      color: TRACE_COLORS[i % TRACE_COLORS.length],
      visible: true,
      lineWidth: DEFAULT_LINE_WIDTH,
    })
  }
  return traces
}
