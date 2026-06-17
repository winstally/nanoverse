'use client'

import * as React from 'react'
import { useQueryState } from 'nuqs'
import { toast } from 'sonner'
import { FileDrop } from '@/modules/analyze/components/FileDrop'
import { TraceList } from '@/modules/analyze/components/TraceList'
import { AxisControls } from '@/modules/analyze/components/AxisControls'
import { ExportButtons } from '@/modules/analyze/components/ExportButtons'
import { PeakPanel } from '@/modules/analyze/components/PeakPanel'
import { FpPanel } from '@/modules/analyze/components/FpPanel'
import { DisplaySettings } from '@/modules/analyze/components/DisplaySettings'
import { CalcCalibration } from '@/modules/analyze/components/CalcCalibration'
import PlotView from '@/modules/analyze/plot/PlotView'
import type { PlotOverlay } from '@/modules/analyze/plot/PlotView'
import { DEFAULT_PLOT_STYLE, type PlotStyle } from '@/modules/analyze/plot/preset'
import {
  transformX,
  normalize,
  baseline,
  DEFAULT_HC_EV_NM,
  DEFAULT_RAMAN_K,
} from '@/modules/analyze/transform'
import { fitPeaks, fitCurve } from '@/modules/analyze/fit'
import type { PeakModel, FitResult } from '@/modules/analyze/fit'
import { fitFp, DEFAULT_FP_OPTIONS } from '@/modules/analyze/fp'
import type { FpFit, FpOptions } from '@/modules/analyze/fp'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type {
  AxisMode,
  BaselineMode,
  LegendLayout,
  MeasurementType,
  Trace,
} from '@/modules/analyze/types'
import { DEFAULT_LEGEND } from '@/modules/analyze/types'
import { ProjectSwitcher } from '@/components/app/ProjectSwitcher'
import { SectionLabel } from '@/components/app/SectionLabel'
import { ToolLayout } from '@/components/app/ToolLayout'
import { Separator } from '@/components/ui/separator'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { useAutosave } from '@/hooks/use-autosave'
import {
  listAnalyzeSessions,
  saveAnalyzeSession,
  loadAnalyzeSession,
  deleteAnalyzeSession,
  type AnalyzeSession,
} from '@/lib/storage'
import { logEvent } from '@/lib/log'

// Muted fit-curve overlay — distinct from coloured data traces, quiet gray.
const FIT_COLOR = '#5b6470'

function newSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function freshSession(): AnalyzeSession {
  return {
    id: newSessionId(),
    name: '新規プロジェクト',
    traces: [],
    type: 'PL',
    style: { ...DEFAULT_PLOT_STYLE },
  }
}

function AnalyzeTool() {
  // ── Session identity ──────────────────────────────────────────────────────
  const [sessionId, setSessionId] = React.useState<string>(() => newSessionId())
  const [sessionName, setSessionName] = React.useState<string>('新規プロジェクト')
  const [sessions, setSessions] = React.useState<AnalyzeSession[]>([])

  // URL sync: ?project=<id> mirrors the currently open session.
  const [projectParam, setProjectParam] = useQueryState('project')

  // ── Document state ────────────────────────────────────────────────────────
  const [traces, setTraces] = React.useState<Trace[]>([])
  const [type, setType] = React.useState<MeasurementType>('PL')
  const [xMode, setXMode] = React.useState<AxisMode>('nm')
  const [laserNm, setLaserNm] = React.useState<number>(532)
  const [doNormalize, setDoNormalize] = React.useState(false)
  const [legend, setLegend] = React.useState<LegendLayout>({ ...DEFAULT_LEGEND })
  const [baselineMode, setBaselineMode] = React.useState<BaselineMode>('none')

  const [model, setModel] = React.useState<PeakModel>('gaussian')
  const [overlay, setOverlay] = React.useState(false)
  const [fitting, setFitting] = React.useState(false)

  // ── FP (Fabry–Pérot) analysis ──────────────────────────────────────────────
  const [analysisType, setAnalysisType] = React.useState<'peak' | 'fp'>('peak')
  const [fpL, setFpL] = React.useState<number>(DEFAULT_FP_OPTIONS.L)
  const [fpMinWl, setFpMinWl] = React.useState<number>(DEFAULT_FP_OPTIONS.minWl)
  const [fpMaxWl, setFpMaxWl] = React.useState<number>(DEFAULT_FP_OPTIONS.maxWl)

  // Editable formula constants (calibration accordion).
  const [hc, setHc] = React.useState<number>(DEFAULT_HC_EV_NM)
  const [ramanK, setRamanK] = React.useState<number>(DEFAULT_RAMAN_K)
  const [fpAFactor, setFpAFactor] = React.useState<number>(
    DEFAULT_FP_OPTIONS.aFactor,
  )
  const [fpAdvanced, setFpAdvanced] = React.useState<
    Pick<FpOptions, 'prominence' | 'distanceNm' | 'smoothWindow' | 'refineNm'>
  >({
    prominence: DEFAULT_FP_OPTIONS.prominence,
    distanceNm: DEFAULT_FP_OPTIONS.distanceNm,
    smoothWindow: DEFAULT_FP_OPTIONS.smoothWindow,
    refineNm: DEFAULT_FP_OPTIONS.refineNm,
  })
  const [fpFitting, setFpFitting] = React.useState(false)
  // FP fit is keyed to the trace id it was computed on; cleared when the source
  // trace changes (FP always uses RAW nm, so axis/normalize changes don't apply).
  const [fpFit, setFpFit] = React.useState<{
    traceId: string
    fit: FpFit | null
    message: string | null
  } | null>(null)

  // Fit output is tagged with the coordinate-space signature it was computed
  // under. When the current signature drifts (axis/normalize/baseline change)
  // the cached results + message are treated as stale and dropped.
  const [fit, setFit] = React.useState<{
    signature: string
    results: FitResult[]
    message: string | null
  } | null>(null)

  const svgRef = React.useRef<SVGSVGElement>(null)

  // ── Refresh saved-session list ────────────────────────────────────────────
  const refreshSessions = React.useCallback(async () => {
    try {
      setSessions(await listAnalyzeSessions())
    } catch {
      // listing failures are non-fatal; switcher just shows nothing.
    }
  }, [])

  React.useEffect(() => {
    let alive = true
    listAnalyzeSessions()
      .then((list) => {
        if (alive) setSessions(list)
      })
      .catch(() => {
        // listing failures are non-fatal; switcher just shows nothing.
      })
    return () => {
      alive = false
    }
  }, [])

  // ── Autosave the current session ──────────────────────────────────────────
  const session = React.useMemo<AnalyzeSession>(() => {
    const style: PlotStyle = {
      ...DEFAULT_PLOT_STYLE,
      legend,
      axisMode: xMode,
      laserNm,
      normalize: doNormalize,
      baselineMode,
      fpL,
      fpMinWl,
      fpMaxWl,
      hcEvNm: hc,
      ramanK,
      fpAFactor,
    }
    return { id: sessionId, name: sessionName, traces, type, style }
  }, [
    sessionId,
    sessionName,
    traces,
    type,
    legend,
    xMode,
    laserNm,
    doNormalize,
    baselineMode,
    fpL,
    fpMinWl,
    fpMaxWl,
    hc,
    ramanK,
    fpAFactor,
  ])

  const persist = React.useCallback(
    async (s: AnalyzeSession) => {
      await saveAnalyzeSession(s)
      logEvent(`解析セッションを保存: ${s.name}`)
      void refreshSessions()
    },
    [refreshSessions],
  )

  const { status } = useAutosave(session, persist)

  // ── Session actions ───────────────────────────────────────────────────────
  const applySession = React.useCallback((s: AnalyzeSession) => {
    setSessionId(s.id)
    setSessionName(s.name)
    setTraces(s.traces ?? [])
    setType(s.type ?? 'PL')
    setXMode(s.style?.axisMode ?? 'nm')
    setLaserNm(s.style?.laserNm ?? 532)
    setDoNormalize(s.style?.normalize ?? false)
    setLegend(s.style?.legend ?? { ...DEFAULT_LEGEND })
    setBaselineMode(s.style?.baselineMode ?? 'none')
    setFpL(s.style?.fpL ?? DEFAULT_FP_OPTIONS.L)
    setFpMinWl(s.style?.fpMinWl ?? DEFAULT_FP_OPTIONS.minWl)
    setFpMaxWl(s.style?.fpMaxWl ?? DEFAULT_FP_OPTIONS.maxWl)
    setHc(s.style?.hcEvNm ?? DEFAULT_HC_EV_NM)
    setRamanK(s.style?.ramanK ?? DEFAULT_RAMAN_K)
    setFpAFactor(s.style?.fpAFactor ?? DEFAULT_FP_OPTIONS.aFactor)
    setFit(null)
    setFpFit(null)
    setOverlay(false)
  }, [])

  const handleSelect = React.useCallback(
    async (id: string) => {
      if (id === sessionId) return
      try {
        const s = await loadAnalyzeSession(id)
        if (s) {
          applySession(s)
          void setProjectParam(s.id)
          logEvent(`解析セッションを読み込み: ${s.name}`)
        }
      } catch {
        toast.error('プロジェクトの読み込みに失敗しました')
      }
    },
    [sessionId, applySession, setProjectParam],
  )

  const handleCreateNew = React.useCallback(() => {
    applySession(freshSession())
    // Clear the URL param; autosave + the state→URL effect will set it once the
    // fresh session is persisted and appears in the saved list.
    void setProjectParam(null)
  }, [applySession, setProjectParam])

  const handleRename = React.useCallback((name: string) => {
    setSessionName(name)
  }, [])

  const handleDelete = React.useCallback(
    async (id: string) => {
      try {
        await deleteAnalyzeSession(id)
        logEvent('解析セッションを削除')
        await refreshSessions()
        if (id === sessionId) applySession(freshSession())
        toast.success('プロジェクトを削除しました')
      } catch {
        toast.error('削除に失敗しました')
      }
    },
    [sessionId, refreshSessions, applySession],
  )

  // ── URL ⇄ state ───────────────────────────────────────────────────────────
  // URL → state (ONCE on mount): if ?project points at a stored session that
  // isn't the current one, load it asynchronously. applySession runs inside the
  // .then callback (not the effect body), so it does not cascade.
  const hydratedFromUrl = React.useRef(false)
  React.useEffect(() => {
    if (hydratedFromUrl.current) return
    hydratedFromUrl.current = true
    if (!projectParam || projectParam === sessionId) return
    const target = projectParam
    loadAnalyzeSession(target)
      .then((s) => {
        if (s) {
          applySession(s)
          logEvent(`解析セッションを読み込み: ${s.name}`)
        } else {
          // Unknown id — drop the stale param, keep the current new session.
          void setProjectParam(null)
        }
      })
      .catch(() => {
        // Load failures are non-fatal; keep the current session.
      })
  }, [projectParam, sessionId, applySession, setProjectParam])

  // state → URL: once the current session is persisted (present in the saved
  // list), reflect its id in the URL. Equality guard keeps this loop-free.
  // Updating the URL (an external system) from an effect is allowed.
  React.useEffect(() => {
    const persisted = sessions.some((s) => s.id === sessionId)
    if (persisted && projectParam !== sessionId) {
      void setProjectParam(sessionId)
    }
  }, [sessions, sessionId, projectParam, setProjectParam])

  // ── Trace mutations ───────────────────────────────────────────────────────
  const handleTraces = React.useCallback(
    (incoming: Trace[]) => {
      setTraces((prev) => {
        const seen = new Set(prev.map((t) => t.id))
        const added = incoming.map((t) => {
          let id = t.id
          let n = 1
          while (seen.has(id)) id = `${t.id}-${n++}`
          seen.add(id)
          // Newly-loaded traces overlay on top of whatever is already shown.
          return { ...t, id, visible: true }
        })
        return [...prev, ...added]
      })

      // Don't silently cut data: while the FP search range is still the factory
      // default, snap it to the loaded data's wavelength extent. Once a custom
      // range is set (by the user or a saved session) this leaves it alone.
      if (
        fpMinWl === DEFAULT_FP_OPTIONS.minWl &&
        fpMaxWl === DEFAULT_FP_OPTIONS.maxWl
      ) {
        const first = incoming.find((t) => t.x.length > 0)
        if (first) {
          let lo = Infinity
          let hi = -Infinity
          for (const v of first.x) {
            if (v < lo) lo = v
            if (v > hi) hi = v
          }
          if (Number.isFinite(lo) && Number.isFinite(hi)) {
            setFpMinWl(Math.floor(lo))
            setFpMaxWl(Math.ceil(hi))
          }
        }
      }
    },
    [fpMinWl, fpMaxWl],
  )

  const handleTraceRename = React.useCallback((id: string, name: string) => {
    setTraces((prev) => prev.map((t) => (t.id === id ? { ...t, name } : t)))
  }, [])

  // Independent visibility: traces overlay freely. Clicking a trace toggles only
  // that trace, so any combination can be shown at once.
  const handleToggle = React.useCallback((id: string) => {
    setTraces((prev) =>
      prev.map((t) => (t.id === id ? { ...t, visible: !t.visible } : t)),
    )
  }, [])

  const handleRemove = React.useCallback((id: string) => {
    setTraces((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const handleColor = React.useCallback((id: string, color: string) => {
    setTraces((prev) => prev.map((t) => (t.id === id ? { ...t, color } : t)))
  }, [])

  const handleLineWidth = React.useCallback((id: string, lineWidth: number) => {
    setTraces((prev) =>
      prev.map((t) => (t.id === id ? { ...t, lineWidth } : t)),
    )
  }, [])

  // ── Derived transforms ────────────────────────────────────────────────────
  const transformOpts = React.useMemo(
    () => ({ xMode, laserNm, xIsWavelength: true, hc, ramanK }),
    [xMode, laserNm, hc, ramanK],
  )

  const axisInfo = React.useMemo(
    () => transformX([], type, transformOpts),
    [type, transformOpts],
  )

  // Identifies the coordinate space a fit was computed in. If it changes, any
  // cached fit results no longer apply and are ignored.
  const fitSignature = `${type}|${xMode}|${laserNm}|${doNormalize}|${baselineMode}`

  const fitCurrent = fit && fit.signature === fitSignature ? fit : null
  const results = React.useMemo(() => fitCurrent?.results ?? [], [fitCurrent])
  const fitMessage = fitCurrent?.message ?? null

  // Visible traces: baseline → normalize → X transform.
  const plotTraces = React.useMemo<Trace[]>(() => {
    const out: Trace[] = []
    for (const t of traces) {
      if (!t.visible) continue
      const { x } = transformX(t.x, type, transformOpts)
      const yBase = baseline(t.y, baselineMode, t.x)
      const y = doNormalize ? normalize(yBase) : yBase
      out.push({ ...t, x, y })
    }
    return out
  }, [traces, type, transformOpts, doNormalize, baselineMode])

  // Fit curve drawn as a dashed overlay, sampled on the first visible trace's X.
  const fitOverlay = React.useMemo<PlotOverlay | undefined>(() => {
    if (!overlay || results.length === 0 || plotTraces.length === 0) {
      return undefined
    }
    const base = plotTraces[0]
    const fy = fitCurve(base.x, results, model)
    return { x: base.x.slice(), y: fy, color: FIT_COLOR }
  }, [overlay, results, plotTraces, model])

  // Fit target: traces overlay freely, but a fit needs exactly one curve. We
  // pick the topmost visible trace (falling back to the topmost trace that has
  // data). Pressing Fit narrows the display to this trace, then fits it — so the
  // result is always unambiguous regardless of how many traces are overlaid.
  const fitTarget = React.useMemo<Trace | undefined>(
    () =>
      traces.find((t) => t.visible && t.x.length > 0) ??
      traces.find((t) => t.x.length > 0),
    [traces],
  )
  const canFit = !!fitTarget && fitTarget.x.length >= 3
  const canFitFp = !!fitTarget && fitTarget.x.length >= 5

  // FP fit applies only while its source trace is still the fit target.
  const fpFitCurrent =
    fpFit && fitTarget && fpFit.traceId === fitTarget.id ? fpFit : null
  const fpResultFit = fpFitCurrent?.fit ?? null
  const fpMessage = fpFitCurrent?.message ?? null

  // Fitted FP peak wavelengths (raw nm) transformed into the CURRENT plot X
  // space (same transform as the trace data), so the vertical markers line up.
  const fpVerticalLines = React.useMemo<number[] | undefined>(() => {
    if (analysisType !== 'fp' || !fpResultFit) return undefined
    return transformX(
      fpResultFit.modes.map((d) => d.calcNm),
      type,
      transformOpts,
    ).x
  }, [analysisType, fpResultFit, type, transformOpts])

  // Y-axis label: measurement-specific intensity in arbitrary units.
  const yLabel = `${doNormalize ? 'Norm. ' : ''}${type === 'PL' ? 'PL ' : ''}Intensity (a.u.)`
  const xAxisLabel = `${axisInfo.xLabel} (${axisInfo.xUnit})`

  // ── Fit ───────────────────────────────────────────────────────────────────
  const handleFit = React.useCallback(() => {
    if (!fitTarget || fitTarget.x.length < 3) {
      setFit({
        signature: fitSignature,
        results: [],
        message: 'フィット対象がありません',
      })
      return
    }
    // Narrow the overlay to the fit target so the fitted curve is unambiguous.
    setTraces((prev) =>
      prev.map((t) => ({ ...t, visible: t.id === fitTarget.id })),
    )
    // Transform the target the same way plotTraces does: baseline → normalize →
    // X transform. Computed here (not via the async-stale derived plotTraces) so
    // the fit always runs on the trace we just narrowed to.
    const { x } = transformX(fitTarget.x, type, transformOpts)
    const yBase = baseline(fitTarget.y, baselineMode, fitTarget.x)
    const y = doNormalize ? normalize(yBase) : yBase
    setFitting(true)
    // setTimeout (not requestAnimationFrame) so the compute still runs when the
    // tab isn't painting — rAF can stall, leaving the button stuck on "フィット中…".
    setTimeout(() => {
      try {
        const found = fitPeaks(x, y, {
          model,
          maxPeaks: 8,
        })
        setFit({
          signature: fitSignature,
          results: found,
          message: found.length === 0 ? 'ピークを検出できませんでした' : null,
        })
        if (found.length > 0) {
          setOverlay(true)
          logEvent(`ピークフィット: ${found.length} 件`)
        }
      } catch {
        setFit({
          signature: fitSignature,
          results: [],
          message: 'フィットに失敗しました',
        })
      } finally {
        setFitting(false)
      }
    }, 0)
  }, [
    fitTarget,
    model,
    fitSignature,
    type,
    transformOpts,
    baselineMode,
    doNormalize,
  ])

  // ── FP fit ──────────────────────────────────────────────────────────────
  const handleFpFit = React.useCallback(() => {
    if (!fitTarget || fitTarget.x.length < 5) {
      setFpFit({
        traceId: fitTarget?.id ?? '',
        fit: null,
        message: 'フィット対象がありません',
      })
      return
    }
    // Narrow the overlay to the fit target so the FP markers are unambiguous.
    setTraces((prev) =>
      prev.map((t) => ({ ...t, visible: t.id === fitTarget.id })),
    )
    const traceId = fitTarget.id
    // FP fits the RAW wavelength (nm) — never the axis-transformed X.
    const rawX = fitTarget.x
    const rawY = fitTarget.y
    setFpFitting(true)
    setTimeout(() => {
      try {
        const opts: FpOptions = {
          ...DEFAULT_FP_OPTIONS,
          ...fpAdvanced,
          L: fpL,
          minWl: fpMinWl,
          maxWl: fpMaxWl,
          aFactor: fpAFactor,
        }
        const res = fitFp(rawX, rawY, opts)
        if (res.ok) {
          setFpFit({ traceId, fit: res.fit, message: null })
          logEvent(`FPフィット: n_eff=${res.fit.nEff.toFixed(3)}`)
        } else {
          setFpFit({ traceId, fit: null, message: res.error })
        }
      } catch {
        setFpFit({ traceId, fit: null, message: 'フィットに失敗しました' })
      } finally {
        setFpFitting(false)
      }
    }, 0)
  }, [fitTarget, fpAdvanced, fpL, fpMinWl, fpMaxWl, fpAFactor])

  const getSvg = React.useCallback(() => svgRef.current, [])

  const switcherItems = React.useMemo(
    () => sessions.map((s) => ({ id: s.id, name: s.name })),
    [sessions],
  )

  const panel = (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
        {/* 1 — Project */}
        <ProjectSwitcher
          items={switcherItems}
          currentId={sessionId}
          currentName={sessionName}
          onRename={handleRename}
          onSelect={handleSelect}
          onCreateNew={handleCreateNew}
          onDelete={handleDelete}
          status={status}
          className="w-full"
        />

        <Separator />

        {/* 2 — Files + trace list */}
        <section className="flex flex-col gap-2">
          <SectionLabel>スペクトル</SectionLabel>
          <FileDrop onTraces={handleTraces} />
          <div className="flex items-center justify-between pt-1">
            <SectionLabel>トレース</SectionLabel>
            <span className="tnum text-xs text-muted-foreground">
              {traces.length}
            </span>
          </div>
          <TraceList
            traces={traces}
            onRename={handleTraceRename}
            onToggle={handleToggle}
            onRemove={handleRemove}
            onColor={handleColor}
            onLineWidth={handleLineWidth}
          />
        </section>

        <Separator />

        {/* 3 — Measurement & axis */}
        <section className="flex flex-col gap-2">
          <SectionLabel>測定と軸</SectionLabel>
          <AxisControls
            type={type}
            onType={setType}
            xMode={xMode}
            onXMode={setXMode}
            laserNm={laserNm}
            onLaserNm={setLaserNm}
            normalize={doNormalize}
            onNormalize={setDoNormalize}
          />
        </section>

        <Separator />

        {/* 4 — Peak analysis */}
        <section className="flex flex-col gap-2">
          <SectionLabel>ピーク解析</SectionLabel>

          <div className="flex flex-col gap-1.5">
            <Label className="text-muted-foreground">解析タイプ</Label>
            <ToggleGroup
              variant="outline"
              size="sm"
              spacing={0}
              value={[analysisType]}
              onValueChange={(v) => {
                const next = v[0] as 'peak' | 'fp' | undefined
                if (next) setAnalysisType(next)
              }}
              aria-label="解析タイプ"
              className="w-full"
            >
              <ToggleGroupItem value="peak" className="flex-1">
                ピーク
              </ToggleGroupItem>
              <ToggleGroupItem value="fp" className="flex-1">
                FP共振
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {analysisType === 'peak' ? (
            <PeakPanel
              model={model}
              onModel={setModel}
              overlay={overlay}
              onOverlay={setOverlay}
              results={results}
              canFit={canFit}
              fitting={fitting}
              fitMessage={fitMessage}
              onFit={handleFit}
              xUnit={axisInfo.xUnit}
            />
          ) : (
            <FpPanel
              L={fpL}
              onL={setFpL}
              minWl={fpMinWl}
              onMinWl={setFpMinWl}
              maxWl={fpMaxWl}
              onMaxWl={setFpMaxWl}
              advanced={fpAdvanced}
              onAdvanced={setFpAdvanced}
              fit={fpResultFit}
              canFit={canFitFp}
              fitting={fpFitting}
              fitMessage={fpMessage}
              onFit={handleFpFit}
            />
          )}
        </section>

        {/* 5 — Display settings (collapsed) */}
        <Accordion>
          <AccordionItem value="display" className="border-t border-border">
            <AccordionTrigger>
              <span className="eyebrow">表示設定</span>
            </AccordionTrigger>
            <AccordionContent>
              <DisplaySettings
                legendVisible={legend.visible}
                onLegendVisible={(v) =>
                  setLegend((l) => ({ ...l, visible: v }))
                }
                onLegendReset={() => setLegend({ ...DEFAULT_LEGEND })}
                baselineMode={baselineMode}
                onBaselineMode={setBaselineMode}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* 6 — Calibration: editable formula constants (collapsed) */}
        <Accordion>
          <AccordionItem value="calc" className="border-t border-border">
            <AccordionTrigger>
              <span className="eyebrow">キャリブレーション</span>
            </AccordionTrigger>
            <AccordionContent>
              <CalcCalibration
                hc={hc}
                onHc={setHc}
                ramanK={ramanK}
                onRamanK={setRamanK}
                fpAFactor={fpAFactor}
                onFpAFactor={setFpAFactor}
                onReset={() => {
                  setHc(DEFAULT_HC_EV_NM)
                  setRamanK(DEFAULT_RAMAN_K)
                  setFpAFactor(DEFAULT_FP_OPTIONS.aFactor)
                }}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* 6 — Export */}
        <div className="mt-auto flex flex-col gap-2 pt-2">
          <SectionLabel>出力</SectionLabel>
          <ExportButtons
            getSvg={getSvg}
            baseName={sessionName.trim() || 'spectrum'}
            disabled={plotTraces.length === 0}
            className="w-full"
          />
        </div>
    </div>
  )

  return (
    <ToolLayout panel={panel} panelTitle="解析設定" panelWidth={320}>
      {/* CENTER: the publication plot only */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background p-4">
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-md border border-border bg-card p-3">
          {plotTraces.length === 0 ? null : (
            <PlotView
              ref={svgRef}
              traces={plotTraces}
              overlay={analysisType === 'peak' ? fitOverlay : undefined}
              verticalLines={fpVerticalLines}
              verticalLineLabel={fpVerticalLines ? 'FP共振' : undefined}
              xLabel={xAxisLabel}
              yLabel={yLabel}
              style={DEFAULT_PLOT_STYLE}
              legend={legend}
              onLegendChange={setLegend}
            />
          )}
        </div>
      </section>
    </ToolLayout>
  )
}

// `AnalyzeTool` consumes the URL search params via nuqs' `useQueryState`, which
// relies on `useSearchParams()`. Next.js requires that consumer to sit under a
// <Suspense> boundary so the rest of the route can still be prerendered.
export default function AnalyzePage() {
  return (
    <React.Suspense fallback={null}>
      <AnalyzeTool />
    </React.Suspense>
  )
}
