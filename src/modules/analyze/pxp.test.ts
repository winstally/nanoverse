import { describe, it, expect } from 'vitest'
import { buildPxp } from './pxp-export'
import { parsePxp } from './pxp'
import type { Trace } from './types'

function trace(id: string, name: string, x: number[], y: number[]): Trace {
  return { id, name, x, y, color: '#000000', visible: true }
}

const x = Array.from({ length: 50 }, (_, i) => 1100 + i * 10) // 1100–1590 nm

async function recreationText(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const dv = new DataView(bytes.buffer)
  let off = 0
  while (off + 8 <= bytes.length) {
    const recordType = dv.getUint16(off, true) & 0x7fff
    const numDataBytes = dv.getInt32(off + 4, true)
    if (numDataBytes < 0 || off + 8 + numDataBytes > bytes.length) break
    if (recordType === 4) {
      return new TextDecoder('latin1').decode(
        bytes.subarray(off + 8, off + 8 + numDataBytes),
      )
    }
    off += 8 + numDataBytes
  }
  throw new Error('missing recreation record')
}

describe('.pxp export → import round-trip', () => {
  it('recovers wave names, X and Y exactly (shared X)', async () => {
    const t1 = trace('a', 'BulkSi', x, x.map((_, i) => Math.sin(i) * 100 + 200))
    const t2 = trace('b', 'gos', x, x.map((_, i) => Math.cos(i) * 50 + 100))

    const buf = await buildPxp([t1, t2]).arrayBuffer()
    const res = parsePxp(buf)

    expect(res.traces.length).toBe(2)
    const byName = Object.fromEntries(res.traces.map((t) => [t.name, t]))
    expect(Object.keys(byName).sort()).toEqual(['BulkSi', 'gos'])
    expect(byName.BulkSi.x).toEqual(x)
    expect(byName.BulkSi.y).toEqual(t1.y)
    expect(byName.gos.y).toEqual(t2.y)
  })

  it('handles traces with different X axes', async () => {
    const x2 = x.map((v) => v + 0.5)
    const t1 = trace('a', 'one', x, x.map(() => 1))
    const t2 = trace('b', 'two', x2, x2.map(() => 2))

    const buf = await buildPxp([t1, t2]).arrayBuffer()
    const res = parsePxp(buf)

    expect(res.traces.length).toBe(2)
    const one = res.traces.find((t) => t.name === 'one')!
    const two = res.traces.find((t) => t.name === 'two')!
    expect(one.x).toEqual(x)
    expect(two.x).toEqual(x2)
  })

  it('drops traces shorter than 2 points', async () => {
    const ok = trace('a', 'good', x, x.map(() => 1))
    const bad = trace('b', 'tiny', [1100], [5])
    const buf = await buildPxp([ok, bad]).arrayBuffer()
    const res = parsePxp(buf)
    expect(res.traces.map((t) => t.name)).toEqual(['good'])
  })

  it('writes graph presentation into the recreation macro', async () => {
    const t1 = {
      ...trace('a', 'BulkSi', x, x.map(() => 1)),
      color: '#3b82f6',
      lineWidth: 2,
    }
    const t2 = {
      ...trace('b', 'gos75', x, x.map(() => 2)),
      color: '#ef4444',
      lineWidth: 3,
    }

    const macro = await recreationText(
      buildPxp([t1, t2], {
        xLabel: 'Raman shift (cm^-1)',
        yLabel: 'Intensity (a.u.)',
        xMin: 200,
        xMax: 800,
        yMin: 0,
        yMax: 10000,
        legend: { x: 0.62, y: 0.04, scale: 1, visible: true },
      }),
    )

    expect(macro).toContain('Display /W=(50,50,560,420) BulkSi vs xx')
    expect(macro).toContain('AppendToGraph gos75 vs xx')
    expect(macro).toContain('ModifyGraph lSize(BulkSi)=2,rgb(BulkSi)=(15163,33410,63222)')
    expect(macro).toContain('ModifyGraph lSize(gos75)=3,rgb(gos75)=(61423,17476,17476)')
    expect(macro).toContain('SetAxis bottom 200,800')
    expect(macro).toContain('SetAxis left 0,10000')
    expect(macro).toContain('Label bottom "Raman shift (cm^-1)"')
    expect(macro).toContain('Label left "Intensity (a.u.)"')
    expect(macro).toContain('Legend/N=text0/J/A=LT/X=62/Y=4')
    expect(macro).toContain('\\s(BulkSi) BulkSi\\r\\s(gos75) gos75')
  })

  it('keeps recreation macro text Igor-4-safe and ASCII readable', async () => {
    const data = trace('jp', '試料A', [10, 20, 30], [1, 2, 3])
    const macro = await recreationText(
      buildPxp([data], {
        xLabel: '2θ (deg)',
        yLabel: '強度 (a.u.)',
        yMin: 0,
        yMax: 10,
        verticalLines: [15],
        verticalLineLabel: 'FP共振',
        legend: { x: 0, y: 0, scale: 1, visible: true },
      }),
    )

    expect(macro).toContain('Label bottom "2theta (deg)"')
    expect(macro).toContain('Label left "Intensity (a.u.)"')
    expect(macro).toContain('AppendToGraph fit_FP_resonance vs x_fit_FP_resonance')
    expect(macro).toContain('\\s(fit_FP_resonance) FP resonance')
    expect(/[^\x09\x0d\x20-\x7e]/.test(macro)).toBe(false)
  })

  it('normalizes superscript scientific units in labels', async () => {
    const data = trace('unit', 'Raman', [200, 300, 400], [1, 2, 3])
    const macro = await recreationText(
      buildPxp([data], {
        xLabel: 'Raman shift (cm⁻¹)',
        yLabel: 'Intensity (a.u.)',
      }),
    )

    expect(macro).toContain('Label bottom "Raman shift (cm^-1)"')
  })

  it('exports only drawable points for log-axis plots', async () => {
    const data = trace('log', 'logTrace', [-1, 1, 10], [5, 0, 100])
    const res = parsePxp(
      await buildPxp([data], { xLog: true, yLog: true }).arrayBuffer(),
    )

    expect(res.traces.length).toBe(1)
    expect(Number.isNaN(res.traces[0].x[0])).toBe(true)
    expect(res.traces[0].x[1]).toBe(1)
    expect(Number.isNaN(res.traces[0].y[1])).toBe(true)
    expect(res.traces[0].y[2]).toBe(100)
  })

  it('detects exported PL energy-axis PXP files as PL on import', async () => {
    const data = trace('pl', 'PL energy', [1.2, 1.3, 1.4], [10, 20, 30])
    const res = parsePxp(
      await buildPxp([data], {
        xLabel: 'Energy (eV)',
        yLabel: 'Intensity (a.u.)',
      }).arrayBuffer(),
    )

    expect(res.type).toBe('PL')
  })

  it('clamps exported legend position into the plot frame', async () => {
    const data = trace(
      'long',
      'very_long_trace_name_that_would_leave_the_plot_frame',
      [1, 2],
      [1, 2],
    )
    const macro = await recreationText(
      buildPxp([data], {
        legend: { x: 0.98, y: 0.98, scale: 1, visible: true },
      }),
    )
    const match = macro.match(/Legend\/N=text0\/J\/A=LT\/X=([^/]+)\/Y=([^ ]+)/)

    expect(match).not.toBeNull()
    expect(Number(match?.[1])).toBeLessThan(98)
    expect(Number(match?.[2])).toBeLessThan(98)
  })

  it('exports analysis overlays without re-importing them as measured traces', async () => {
    const data = trace('a', 'BulkSi', x, x.map(() => 1))
    const blob = buildPxp([data], {
      yMin: 0,
      yMax: 10,
      overlays: [
        {
          name: 'fit',
          x,
          y: x.map(() => 2),
          color: '#5b6470',
          lineWidth: 2,
          lineStyle: 3,
        },
      ],
      verticalLines: [1200, 1300],
      verticalLineLabel: 'FP',
      legend: { x: 0, y: 0, scale: 1, visible: true },
    })

    const macro = await recreationText(blob)
    expect(macro).toContain('AppendToGraph fit_fit vs x_fit_fit')
    expect(macro).toContain('lStyle(fit_fit)=3')
    expect(macro).toContain('AppendToGraph fit_FP vs x_fit_FP')
    expect(macro).toContain('\\s(fit_FP) FP')

    const res = parsePxp(await blob.arrayBuffer())
    expect(res.traces.map((t) => t.name)).toEqual(['BulkSi'])
  })
})
