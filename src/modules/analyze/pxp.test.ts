import { describe, it, expect } from 'vitest'
import { buildPxp } from './pxp-export'
import { parsePxp } from './pxp'
import type { Trace } from './types'

function trace(id: string, name: string, x: number[], y: number[]): Trace {
  return { id, name, x, y, color: '#000000', visible: true }
}

const x = Array.from({ length: 50 }, (_, i) => 1100 + i * 10) // 1100–1590 nm

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
})
