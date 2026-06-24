import { describe, expect, it } from 'vitest'
import { resolvePlotDomains } from './domain'

describe('resolvePlotDomains', () => {
  it('uses the drawn nice domain for automatic linear axes', () => {
    const domains = resolvePlotDomains({
      traces: [{ x: [1.2, 8.8], y: [2.1, 9.9] }],
    })

    expect(domains.drawnX).toEqual(domains.shownX)
    expect(domains.drawnY).toEqual(domains.shownY)
    expect(domains.x.manual).toBe(false)
    expect(domains.y.manual).toBe(false)
  })

  it('respects valid manual bounds and falls back on invalid log bounds', () => {
    const domains = resolvePlotDomains({
      traces: [{ x: [1, 10, 100], y: [1, 10, 100] }],
      xLog: true,
      yLog: true,
      xMin: -1,
      xMax: 1000,
      yMin: 10,
      yMax: 1,
    })

    expect(domains.drawnX).toEqual([1, 1000])
    expect(domains.x.manual).toBe(true)
    expect(domains.drawnY).toEqual([1, 100])
    expect(domains.y.manual).toBe(false)
  })

  it('includes overlay data in autoscale domains', () => {
    const domains = resolvePlotDomains({
      traces: [{ x: [10, 20], y: [1, 2] }],
      overlays: [{ x: [30, 40], y: [3, 4] }],
    })

    expect(domains.autoX).toEqual([10, 40])
    expect(domains.autoY).toEqual([1, 4])
  })
})
