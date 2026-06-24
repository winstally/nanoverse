/**
 * Raman strain readout.
 *
 * Strain shifts a phonon peak: Δω = ω − ω_ref, and biaxial strain ε = −Δω / b
 * (tensile ⇒ downshift), with b the strain-shift coefficient (~715 Si, ~415 Ge
 * cm⁻¹ per unit strain). The reference ω_ref can be an unstrained bulk value OR
 * — for a process/structure series (e.g. a GOS film vs its released bridges) —
 * one of the measured samples, so each row shows the strain CHANGE relative to
 * that reference sample. Positions are read directly from each trace (no fit
 * needed), in the current plot units (cm⁻¹ for Raman).
 */

export interface StrainRefs {
  /** Unstrained Si–Si position (cm⁻¹) — used only when the reference is "bulk". */
  siRef: number
  /** Unstrained Ge–Ge position (cm⁻¹) — used only when the reference is "bulk". */
  geRef: number
  /** Si biaxial strain-shift coefficient |Δω/ε| (cm⁻¹). */
  siCoef: number
  /** Ge biaxial strain-shift coefficient |Δω/ε| (cm⁻¹). */
  geCoef: number
}

export const DEFAULT_STRAIN_REFS: StrainRefs = {
  siRef: 520,
  geRef: 300,
  siCoef: 715,
  geCoef: 415,
}

/** Sentinel reference id meaning "unstrained bulk values". */
export const BULK_REF = 'bulk'

export interface StrainSeries {
  id: string
  name: string
  x: number[]
  y: number[]
}

export interface StrainRow {
  id: string
  name: string
  isRef: boolean
  gePos: number | null
  geDw: number | null
  geStrain: number | null
  siPos: number | null
  siDw: number | null
  siStrain: number | null
}

export interface StrainTable {
  rows: StrainRow[]
  refLabel: string
  refGe: number | null
  refSi: number | null
}

// First-order phonon identification windows (cm⁻¹).
const SI_WIN: [number, number] = [505, 528]
const GE_WIN: [number, number] = [285, 312]

/**
 * Sub-pixel peak center in [lo,hi] (parabolic interpolation on lightly-smoothed
 * data). Returns null when no peak stands out (amplitude < 3% of the trace span)
 * so windows without a real mode (e.g. Ge in a bare-Si spectrum) stay blank.
 */
export function peakCenter(
  x: number[],
  y: number[],
  lo: number,
  hi: number,
): number | null {
  const n = Math.min(x.length, y.length)
  if (n < 5) return null
  const W = 2
  const sm = (i: number): number => {
    let s = 0
    let c = 0
    for (let j = -W; j <= W; j++) {
      const k = i + j
      if (k >= 0 && k < n) {
        s += y[k]
        c++
      }
    }
    return s / c
  }
  let bi = -1
  let bv = -Infinity
  let winMin = Infinity
  for (let i = 0; i < n; i++) {
    if (x[i] < lo || x[i] > hi) continue
    const v = sm(i)
    if (v > bv) {
      bv = v
      bi = i
    }
    if (v < winMin) winMin = v
  }
  if (bi < 1 || bi >= n - 1) return null
  // Prominence guard: the peak must rise above the trace's noise floor.
  let gmin = Infinity
  let gmax = -Infinity
  for (let i = 0; i < n; i++) {
    if (y[i] < gmin) gmin = y[i]
    if (y[i] > gmax) gmax = y[i]
  }
  if (!(bv - winMin > 0.03 * (gmax - gmin))) return null
  const y0 = sm(bi - 1)
  const y1 = sm(bi)
  const y2 = sm(bi + 1)
  const d = y0 - 2 * y1 + y2
  let cm = x[bi]
  if (d !== 0) {
    const off = (0.5 * (y0 - y2)) / d
    if (Math.abs(off) <= 1) cm = x[bi] + (off * (x[bi + 1] - x[bi - 1])) / 2
  }
  return cm
}

/**
 * Per-trace Si/Ge strain relative to either bulk values or a chosen reference
 * trace. `refMode` is BULK_REF or a trace id.
 */
export function computeStrainTable(
  traces: StrainSeries[],
  refMode: string,
  refs: StrainRefs,
): StrainTable {
  const centers = traces.map((t) => ({
    id: t.id,
    name: t.name,
    ge: peakCenter(t.x, t.y, GE_WIN[0], GE_WIN[1]),
    si: peakCenter(t.x, t.y, SI_WIN[0], SI_WIN[1]),
  }))

  let refGe: number | null
  let refSi: number | null
  let refLabel: string
  if (refMode === BULK_REF) {
    refGe = refs.geRef
    refSi = refs.siRef
    refLabel = `バルク (Ge ${refs.geRef}, Si ${refs.siRef})`
  } else {
    const r = centers.find((c) => c.id === refMode)
    refGe = r?.ge ?? null
    refSi = r?.si ?? null
    refLabel = traces.find((t) => t.id === refMode)?.name ?? refMode
  }

  const strain = (dw: number | null, coef: number): number | null =>
    dw == null || !(coef > 0) ? null : (-dw / coef) * 100

  const rows: StrainRow[] = centers.map((c) => {
    const geDw = c.ge != null && refGe != null ? c.ge - refGe : null
    const siDw = c.si != null && refSi != null ? c.si - refSi : null
    return {
      id: c.id,
      name: c.name,
      isRef: refMode === c.id,
      gePos: c.ge,
      geDw,
      geStrain: strain(geDw, refs.geCoef),
      siPos: c.si,
      siDw,
      siStrain: strain(siDw, refs.siCoef),
    }
  })

  return { rows, refLabel, refGe, refSi }
}
