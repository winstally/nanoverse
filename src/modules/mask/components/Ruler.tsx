'use client'

const RULER_SIZE = 22

/**
 * Choose a "nice" tick step (in µm) so that ticks are at least ~minPx apart
 * on screen. scale = screen pixels per µm.
 */
function niceStep(scale: number, minPx = 60): number {
  const rawUm = minPx / Math.max(scale, 1e-6)
  const pow = Math.pow(10, Math.floor(Math.log10(rawUm)))
  const candidates = [1, 2, 5, 10]
  for (const c of candidates) {
    if (c * pow >= rawUm) return c * pow
  }
  return 10 * pow
}

function formatUm(um: number): string {
  if (um >= 100) return String(Math.round(um))
  if (um >= 10) return um.toFixed(0)
  return um.toFixed(um < 1 ? 2 : 1)
}

interface RulerProps {
  orientation: 'horizontal' | 'vertical'
  /** total µm spanned by the canvas along this axis */
  lengthUm: number
  /** screen pixels per µm along this axis */
  scale: number
  /** screen length (px) of the canvas along this axis */
  pxLength: number
  /** leading offset (px) before the canvas content begins (e.g. corner box) */
  offset?: number
}

export function Ruler({
  orientation,
  lengthUm,
  scale,
  pxLength,
  offset = 0,
}: RulerProps) {
  const step = niceStep(scale)
  const ticks: { um: number; pos: number }[] = []
  for (let um = 0; um <= lengthUm + 1e-6; um += step) {
    ticks.push({ um, pos: um * scale })
  }

  const horizontal = orientation === 'horizontal'

  if (horizontal) {
    return (
      <div
        className="relative shrink-0 overflow-hidden border-b border-border bg-muted text-muted-foreground"
        style={{
          height: RULER_SIZE,
          marginLeft: offset,
          width: pxLength,
        }}
      >
        {ticks.map(({ um, pos }) => (
          <div
            key={um}
            className="absolute bottom-0 flex flex-col items-start"
            style={{ left: pos }}
          >
            <span className="tnum pl-0.5 text-[9px] leading-none">
              {formatUm(um)}
            </span>
            <span
              className="mt-0.5 block w-px bg-border"
              style={{ height: 5 }}
            />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div
      className="relative shrink-0 overflow-hidden border-r border-border bg-muted text-muted-foreground"
      style={{ width: RULER_SIZE, height: pxLength }}
    >
      {ticks.map(({ um, pos }) => (
        <div
          key={um}
          className="absolute right-0 flex items-center"
          style={{ top: pos }}
        >
          <span
            className="tnum text-[9px] leading-none"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
          >
            {formatUm(um)}
          </span>
          <span
            className="ml-0.5 block h-px bg-border"
            style={{ width: 5 }}
          />
        </div>
      ))}
    </div>
  )
}

export { RULER_SIZE }
