/**
 * Fabry–Pérot (FP) resonance fitting.
 *
 * Direct TypeScript port of the user's `fp_fit.py`.
 *
 * Model:
 *     lambda_m = A / (m + delta)
 *     A        = 2000 * n_eff * L_um
 *
 * FP works on WAVELENGTH (nm). Always feed this the trace's RAW x in nm — never
 * the eV / Raman-shift / 2θ-transformed abscissa.
 */

export interface FpOptions {
  /** Cavity length in µm. */
  L: number
  /** Peak-search minimum wavelength (nm). */
  minWl: number
  /** Peak-search maximum wavelength (nm). */
  maxWl: number
  /** Peak prominence for automatic detection. */
  prominence: number
  /** Minimum peak spacing (nm). */
  distanceNm: number
  /** Savitzky–Golay smoothing window (points). */
  smoothWindow: number
  /** Refine each detected peak to the raw maximum within ± this many nm. */
  refineNm: number
  /** Mode number for the first selected peak; auto-searched if omitted. */
  mStart?: number
  /** Minimum mode start for the auto search. */
  mMin: number
  /** Maximum mode start for the auto search. */
  mMax: number
}

export interface FpFit {
  /** Selected peak wavelengths (nm), ascending. */
  peaksNm: number[]
  /** Mode number assigned to each peak (descending: mStart, mStart-1, …). */
  m: number[]
  /** Calculated wavelength for each mode (nm). */
  calcNm: number[]
  /** Observed − calculated residual for each peak (nm). */
  residualNm: number[]
  /** Fitted A = 2000 * n_eff * L (nm). */
  A: number
  /** Effective refractive index. */
  nEff: number
  /** Fitted phase offset δ. */
  delta: number
  /** Root-mean-square of the residuals (nm). */
  rmseNm: number
  /** Mode number assigned to the first (shortest-λ) selected peak. */
  mStart: number
  /** Prominence actually used (auto-lowered from the requested value if needed). */
  effectiveProminence?: number
  /** Min peak spacing (nm) actually used (auto-reduced if needed). */
  effectiveDistanceNm?: number
}

export type FpResult = { ok: true; fit: FpFit } | { ok: false; error: string }

/** Default options mirroring fp_fit.py argparse defaults. */
export const DEFAULT_FP_OPTIONS: FpOptions = {
  L: 6,
  minWl: 1160,
  maxWl: 1580,
  prominence: 100,
  distanceNm: 20,
  smoothWindow: 9,
  refineNm: 3,
  mMin: 10,
  mMax: 80,
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Mirrors fp_fit.py `odd_window`: force an odd window in [3, maxLen]. */
function oddWindow(n: number, maxLen: number): number {
  n = Math.trunc(n)
  if (n < 3) n = 3
  if (n % 2 === 0) n += 1
  if (n >= maxLen) n = maxLen % 2 === 0 ? maxLen - 1 : maxLen
  if (n % 2 === 0) n -= 1
  return Math.max(3, n)
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const s = values.slice().sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid]
}

/**
 * Savitzky–Golay smoothing filter (centered, returns the smoothed value at each
 * point). Window must be odd and >= 3; polyorder = min(3, window - 1).
 *
 * Implemented via least-squares polynomial coefficients on the centered index
 * window. Edges use shifted windows (matching scipy's default `mode='interp'`,
 * which fits the boundary polynomial rather than padding).
 */
function savgolFilter(y: number[], window: number, polyorder: number): number[] {
  const n = y.length
  if (n === 0) return []
  if (window > n) window = n % 2 === 0 ? n - 1 : n
  if (window < 3) return y.slice()
  if (window % 2 === 0) window -= 1
  const order = Math.min(polyorder, window - 1)
  const half = (window - 1) / 2

  // Precompute SG smoothing coefficients (value at the window center) for an
  // arbitrary evaluation position `pos` within the window via the normal
  // equations of the Vandermonde least-squares fit.
  // We build coefficients for each output offset relative to window start so
  // boundary points can reuse a shifted window without re-solving.
  const coeffsFor = (evalPos: number): number[] => {
    // Vandermonde matrix A (window x (order+1)), columns z^0..z^order with
    // z = i - half (centered). Solve (A^T A) c_k = A^T e_k for the row giving
    // the polynomial value at evalPos (centered). The smoothing weights are
    // w_i = sum_k P[k] * (Ainv_row)[k] ... — simpler: weights = e_pos^T (A (A^T A)^-1 A^T).
    const cols = order + 1
    // Build A^T A (cols x cols) and we also need A explicitly.
    const A: number[][] = []
    for (let i = 0; i < window; i++) {
      const z = i - half
      const row: number[] = []
      let zp = 1
      for (let k = 0; k < cols; k++) {
        row.push(zp)
        zp *= z
      }
      A.push(row)
    }
    // ATA = A^T A
    const ATA: number[][] = Array.from({ length: cols }, () =>
      new Array<number>(cols).fill(0),
    )
    for (let a = 0; a < cols; a++) {
      for (let b = 0; b < cols; b++) {
        let s = 0
        for (let i = 0; i < window; i++) s += A[i][a] * A[i][b]
        ATA[a][b] = s
      }
    }
    const ATAinv = invertMatrix(ATA)
    if (!ATAinv) {
      // Degenerate — fall back to a flat moving average.
      return new Array<number>(window).fill(1 / window)
    }
    // p = powers of evalPos
    const p: number[] = []
    let zp = 1
    for (let k = 0; k < cols; k++) {
      p.push(zp)
      zp *= evalPos
    }
    // weights_i = sum_a sum_b p[a] * ATAinv[a][b] * A[i][b]
    const weights = new Array<number>(window).fill(0)
    for (let i = 0; i < window; i++) {
      let wi = 0
      for (let a = 0; a < cols; a++) {
        let inner = 0
        for (let b = 0; b < cols; b++) inner += ATAinv[a][b] * A[i][b]
        wi += p[a] * inner
      }
      weights[i] = wi
    }
    return weights
  }

  // Center weights (used for all interior points).
  const centerW = coeffsFor(0)

  const out = new Array<number>(n)
  for (let i = 0; i < n; i++) {
    let start: number
    let evalPos: number
    if (i < half) {
      start = 0
      evalPos = i - half // negative
    } else if (i >= n - half) {
      start = n - window
      evalPos = i - (start + half)
    } else {
      start = i - half
      evalPos = 0
    }
    const w = evalPos === 0 ? centerW : coeffsFor(evalPos)
    let acc = 0
    for (let j = 0; j < window; j++) acc += w[j] * y[start + j]
    out[i] = acc
  }
  return out
}

/** Gauss–Jordan matrix inverse. Returns null if singular. */
function invertMatrix(m: number[][]): number[][] | null {
  const n = m.length
  const a = m.map((row, i) => [
    ...row,
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  ])
  for (let col = 0; col < n; col++) {
    // Partial pivot.
    let pivot = col
    let best = Math.abs(a[col][col])
    for (let r = col + 1; r < n; r++) {
      const v = Math.abs(a[r][col])
      if (v > best) {
        best = v
        pivot = r
      }
    }
    if (best < 1e-12) return null
    if (pivot !== col) {
      const tmp = a[pivot]
      a[pivot] = a[col]
      a[col] = tmp
    }
    const pv = a[col][col]
    for (let j = 0; j < 2 * n; j++) a[col][j] /= pv
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const f = a[r][col]
      if (f === 0) continue
      for (let j = 0; j < 2 * n; j++) a[r][j] -= f * a[col][j]
    }
  }
  return a.map((row) => row.slice(n))
}

/**
 * Find local maxima honouring a prominence threshold and a minimum sample
 * distance, mirroring scipy.signal.find_peaks(prominence, distance).
 */
function findPeaks(
  y: number[],
  prominence: number,
  distanceSamples: number,
): number[] {
  const n = y.length
  // 1. Local maxima (plateau-aware, matching scipy: take the midpoint of a flat
  //    top). A point is a peak if it is strictly greater than its left neighbour
  //    and the next differing right neighbour is strictly smaller.
  const candidates: number[] = []
  let i = 1
  while (i < n - 1) {
    if (y[i - 1] < y[i]) {
      let ahead = i + 1
      while (ahead < n - 1 && y[ahead] === y[i]) ahead++
      if (y[ahead] < y[i]) {
        const left = i
        const right = ahead - 1
        candidates.push(Math.floor((left + right) / 2))
        i = ahead
        continue
      }
    }
    i++
  }
  if (candidates.length === 0) return []

  // 2. Prominence filter (scipy peak_prominences with full window).
  const keptProm = candidates
    .map((p) => ({ p, prom: peakProminence(y, p) }))
    .filter((o) => o.prom >= prominence)

  // 3. Minimum-distance selection (scipy: keep highest peaks first, remove
  //    neighbours within `distance`).
  if (distanceSamples > 1 && keptProm.length > 1) {
    const order = keptProm
      .map((o, idx) => ({ idx, peak: o.p, height: y[o.p] }))
      .sort((a, b) => a.height - b.height) // ascending; scipy iterates high→low
    const keepFlag = new Array<boolean>(keptProm.length).fill(true)
    // Iterate from highest priority (largest height) to lowest.
    for (let k = order.length - 1; k >= 0; k--) {
      const j = order[k].idx
      if (!keepFlag[j]) continue
      // Suppress neighbours within distance on both sides.
      let nb = j - 1
      while (nb >= 0 && keptProm[j].p - keptProm[nb].p < distanceSamples) {
        keepFlag[nb] = false
        nb--
      }
      nb = j + 1
      while (
        nb < keptProm.length &&
        keptProm[nb].p - keptProm[j].p < distanceSamples
      ) {
        keepFlag[nb] = false
        nb++
      }
    }
    return keptProm.filter((_, idx) => keepFlag[idx]).map((o) => o.p)
  }
  return keptProm.map((o) => o.p)
}

/**
 * Topographic prominence of `peak` in `y`, using the full signal as the search
 * window (scipy `wlen=None`).
 */
function peakProminence(y: number[], peak: number): number {
  const height = y[peak]
  // Left base: walk left until a sample >= height; track the minimum along the
  // way.
  let leftMin = height
  let i = peak - 1
  while (i >= 0 && y[i] <= height) {
    if (y[i] < leftMin) leftMin = y[i]
    i--
  }
  let rightMin = height
  i = peak + 1
  const n = y.length
  while (i < n && y[i] <= height) {
    if (y[i] < rightMin) rightMin = y[i]
    i++
  }
  const base = Math.max(leftMin, rightMin)
  return height - base
}

// ── peak detection (port of detect_main_peaks) ────────────────────────────────

function detectMainPeaks(
  x: number[],
  y: number[],
  opts: FpOptions,
): {
  peaks: number[]
  effectiveProminence?: number
  effectiveDistanceNm?: number
  error?: string
} {
  // Restrict to [minWl, maxWl].
  const xs: number[] = []
  const ys: number[] = []
  for (let i = 0; i < x.length; i++) {
    if (x[i] >= opts.minWl && x[i] <= opts.maxWl) {
      xs.push(x[i])
      ys.push(y[i])
    }
  }
  if (xs.length < 5) {
    return { peaks: [], error: '選択した波長範囲のデータ点が不足しています' }
  }

  const win = oddWindow(opts.smoothWindow, xs.length)
  const ySmooth = savgolFilter(ys, win, Math.min(3, win - 1))

  // dx = median diff.
  const diffs: number[] = []
  for (let i = 1; i < xs.length; i++) diffs.push(xs[i] - xs[i - 1])
  const dx = median(diffs)
  const distanceSamples = Math.max(
    1,
    Math.round(dx > 0 ? opts.distanceNm / dx : 1),
  )

  // Smoothed-signal range (used to derive adaptive prominence thresholds, so the
  // detector works regardless of the data's absolute intensity scale).
  let smin = Infinity
  let smax = -Infinity
  for (const v of ySmooth) {
    if (v < smin) smin = v
    if (v > smax) smax = v
  }
  const range = smax - smin

  // Adaptive search: try the requested prominence first, then progressively
  // lower thresholds (fractions of the signal range), and if still short, relax
  // the minimum spacing. Pick the HIGHEST prominence that yields >=3 peaks
  // (cleanest set). This avoids the user having to hand-tune prominence/distance.
  const promLadder: number[] = [opts.prominence]
  for (const f of [0.25, 0.15, 0.1, 0.06, 0.03, 0.015, 0.008]) {
    const p = range * f
    if (p > 0 && p < opts.prominence) promLadder.push(p)
  }
  const distLadder = [
    distanceSamples,
    Math.max(1, Math.floor(distanceSamples / 2)),
    1,
  ]

  let peakIdx: number[] = []
  let usedProm = opts.prominence
  let usedDist = distanceSamples
  outer: for (const dist of distLadder) {
    for (const prom of promLadder) {
      const found = findPeaks(ySmooth, prom, dist)
      if (found.length >= 3) {
        peakIdx = found
        usedProm = prom
        usedDist = dist
        break outer
      }
    }
  }

  if (peakIdx.length < 3) {
    return {
      peaks: [],
      error:
        'ピークを検出できませんでした。波長範囲を広げるか、データを確認してください。',
    }
  }

  const effectiveProminence = usedProm
  const effectiveDistanceNm = usedDist * dx

  // Refine each detected peak to the RAW maximum within ±refineNm.
  const refined: number[] = []
  for (const idx of peakIdx) {
    const wl0 = xs[idx]
    let bestWl = wl0
    let bestY = -Infinity
    let any = false
    for (let i = 0; i < xs.length; i++) {
      if (xs[i] >= wl0 - opts.refineNm && xs[i] <= wl0 + opts.refineNm) {
        any = true
        if (ys[i] > bestY) {
          bestY = ys[i]
          bestWl = xs[i]
        }
      }
    }
    refined.push(any ? bestWl : wl0)
  }

  // Dedup (round to 4 decimals, like np.round(refined, 4)) + sort ascending.
  const seen = new Set<number>()
  const peaks: number[] = []
  for (const w of refined) {
    const r = Math.round(w * 1e4) / 1e4
    if (!seen.has(r)) {
      seen.add(r)
      peaks.push(r)
    }
  }
  peaks.sort((a, b) => a - b)
  return { peaks, effectiveProminence, effectiveDistanceNm }
}

// ── linear fit (port of fit_for_m_start) ──────────────────────────────────────

/**
 * Fit A and delta for consecutive modes mStart, mStart-1, … assigned to the
 * ascending peak list.
 *
 * Linear least-squares of m vs (1/lambda): m = A*(1/lambda) - delta, so the
 * slope is A and the intercept is -delta.
 */
function fitForMStart(peaksNm: number[], L: number, mStart: number): FpFit {
  const n = peaksNm.length
  const m = peaksNm.map((_, i) => mStart - i)
  const invLambda = peaksNm.map((p) => 1.0 / p)

  // polyfit(invLambda, m, 1) — ordinary least squares slope & intercept.
  let sx = 0
  let sy = 0
  let sxx = 0
  let sxy = 0
  for (let i = 0; i < n; i++) {
    sx += invLambda[i]
    sy += m[i]
    sxx += invLambda[i] * invLambda[i]
    sxy += invLambda[i] * m[i]
  }
  const denom = n * sxx - sx * sx
  const A = denom !== 0 ? (n * sxy - sx * sy) / denom : 0
  const intercept = (sy - A * sx) / n
  const delta = -intercept
  const nEff = A / (2000.0 * L)

  const calc = m.map((mi) => A / (mi + delta))
  const residual = peaksNm.map((p, i) => p - calc[i])
  let sumSq = 0
  for (const r of residual) sumSq += r * r
  const rmse = Math.sqrt(sumSq / n)

  return {
    peaksNm: peaksNm.slice(),
    m,
    calcNm: calc,
    residualNm: residual,
    A,
    nEff,
    delta,
    rmseNm: rmse,
    mStart: Math.trunc(mStart),
  }
}

/** Choose the integer mStart giving -0.5 <= delta < 0.5 (port of choose_mode_start). */
function chooseModeStart(
  peaksNm: number[],
  L: number,
  mMin: number,
  mMax: number,
): FpFit {
  const fits: FpFit[] = []
  for (let m = mMin; m <= mMax; m++) fits.push(fitForMStart(peaksNm, L, m))

  const better = (a: FpFit, b: FpFit): FpFit => {
    if (a.rmseNm !== b.rmseNm) return a.rmseNm < b.rmseNm ? a : b
    return Math.abs(a.delta) <= Math.abs(b.delta) ? a : b
  }

  const valid = fits.filter(
    (f) => f.delta >= -0.5 && f.delta < 0.5 && f.nEff >= 1.0 && f.nEff <= 6.0,
  )
  const pool = valid.length > 0 ? valid : fits
  return pool.reduce((best, f) => better(best, f))
}

// ── public entry ──────────────────────────────────────────────────────────────

/**
 * Fit FP resonance peaks. `x` must be wavelength in nm. Returns the chosen fit
 * or an error message (Japanese) suitable for surfacing in the UI.
 */
export function fitFp(x: number[], y: number[], opts: FpOptions): FpResult {
  if (x.length < 5 || y.length < 5) {
    return { ok: false, error: 'データ点が不足しています' }
  }

  // 1. Sort (x, y) by x ascending.
  const idx = x.map((_, i) => i).sort((a, b) => x[a] - x[b])
  const xs = idx.map((i) => x[i])
  const ys = idx.map((i) => y[i])

  // 2. Detect peaks.
  const det = detectMainPeaks(xs, ys, opts)
  if (det.error) return { ok: false, error: det.error }
  const peaks = det.peaks
  if (peaks.length < 3) {
    return { ok: false, error: 'ピークが3つ以上必要です' }
  }

  // 3/4. Fit for a given or auto-searched mStart.
  const fit =
    opts.mStart != null
      ? fitForMStart(peaks, opts.L, opts.mStart)
      : chooseModeStart(peaks, opts.L, opts.mMin, opts.mMax)

  if (!Number.isFinite(fit.A) || !Number.isFinite(fit.nEff)) {
    return { ok: false, error: 'フィットに失敗しました' }
  }

  fit.effectiveProminence = det.effectiveProminence
  fit.effectiveDistanceNm = det.effectiveDistanceNm
  return { ok: true, fit }
}
