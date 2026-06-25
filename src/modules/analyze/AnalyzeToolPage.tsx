'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { FileDrop } from '@/modules/analyze/components/FileDrop'
import { TraceList } from '@/modules/analyze/components/TraceList'
import { AxisControls } from '@/modules/analyze/components/AxisControls'
import {
  RangeControls,
  type AxisRange,
} from '@/modules/analyze/components/RangeControls'
import { ExportButtons } from '@/modules/analyze/components/ExportButtons'
import { PeakPanel } from '@/modules/analyze/components/PeakPanel'
import { FpPanel } from '@/modules/analyze/components/FpPanel'
import { CalcCalibration } from '@/modules/analyze/components/CalcCalibration'
import { StrainPanel } from '@/modules/analyze/components/StrainPanel'
import {
  DEFAULT_STRAIN_REFS,
  BULK_REF,
  type StrainRefs,
} from '@/modules/analyze/strain'
import PlotView from '@/modules/analyze/plot/PlotView'
import type { PlotOverlay } from '@/modules/analyze/plot/PlotView'
import { resolvePlotDomains } from '@/modules/analyze/plot/domain'
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
import { parseSpectrumText } from '@/modules/analyze/parse'
import { buildPxp } from '@/modules/analyze/pxp-export'
import { exportPng } from '@/modules/analyze/plot/export'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type {
  AxisMode,
  BaselineMode,
  LegendLayout,
  MeasurementType,
  Trace,
} from '@/modules/analyze/types'
import { DEFAULT_LEGEND, DEFAULT_LINE_WIDTH, TRACE_COLORS } from '@/modules/analyze/types'
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
import { useHistory } from '@/hooks/use-history'
import {
  listAnalyzeSessions,
  saveAnalyzeSession,
  loadAnalyzeSession,
  deleteAnalyzeSession,
  onDataChange,
  type AnalyzeSession,
} from '@/lib/storage'
import { logEvent } from '@/lib/log'
import { downloadBlob } from '@/lib/download'
import { DEFAULT_LOCALE, Locale, t as translate } from '@/lib/i18n'
import { useI18n } from '@/components/app/I18nProvider'
import {
  WEBMCP_ACTION_EVENT,
  summarizeError,
  type WebMcpActionRequest,
} from '@/lib/webmcp-actions'

// Muted fit-curve overlay — distinct from coloured data traces, quiet gray.
const FIT_COLOR = '#5b6470'

function newSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function freshSession(locale: Locale = DEFAULT_LOCALE): AnalyzeSession {
  return {
    id: newSessionId(),
    name: translate('project.analyze.newName', {}, locale),
    traces: [],
    type: 'PL',
    style: { ...DEFAULT_PLOT_STYLE },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function parseMeasurementType(value: unknown): MeasurementType | null {
  return value === 'PL' || value === 'Raman' || value === 'XRD' ? value : null
}

function parseAxisMode(value: unknown): AxisMode | null {
  return value === 'nm' || value === 'eV' ? value : null
}

function parseBaselineMode(value: unknown): BaselineMode | null {
  return value === 'none' || value === 'min' || value === 'endpoints' ? value : null
}

function parsePeakModel(value: unknown): PeakModel | null {
  return value === 'gaussian' || value === 'lorentzian' ? value : null
}

function summarizeAnalyzeSession(session: AnalyzeSession) {
  return {
    id: session.id,
    name: session.name,
    type: session.type,
    updatedAt: session.updatedAt ?? null,
    traceCount: session.traces.length,
    visibleTraceCount: session.traces.filter((trace) => trace.visible).length,
    traces: session.traces.map((trace) => ({
      id: trace.id,
      name: trace.name,
      points: Math.min(trace.x.length, trace.y.length),
      visible: trace.visible,
      color: trace.color,
      lineWidth: trace.lineWidth ?? DEFAULT_LINE_WIDTH,
      xMin: trace.x.length ? Math.min(...trace.x) : null,
      xMax: trace.x.length ? Math.max(...trace.x) : null,
      yMin: trace.y.length ? Math.min(...trace.y) : null,
      yMax: trace.y.length ? Math.max(...trace.y) : null,
    })),
    style: session.style,
  }
}

interface AnalyzeToolPageProps {
  initialProjectId: string | null
}

function replaceProjectParam(projectId: string | null): void {
  const url = new URL(window.location.href)
  if (projectId) url.searchParams.set('project', projectId)
  else url.searchParams.delete('project')
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
}

function useAnalyzeToolView({ initialProjectId }: AnalyzeToolPageProps) {
  const { locale, t } = useI18n()
  // ── Session identity ──────────────────────────────────────────────────────
  const [sessionId, setSessionId] = React.useState<string>(() => newSessionId())
  const [sessionName, setSessionName] = React.useState<string>(() =>
    translate('project.analyze.newName', {}, locale),
  )
  const [sessions, setSessions] = React.useState<AnalyzeSession[]>([])

  // URL sync: ?project=<id> mirrors the currently open session.
  const projectParamRef = React.useRef(initialProjectId)
  const setProjectParam = React.useCallback((projectId: string | null) => {
    projectParamRef.current = projectId
    replaceProjectParam(projectId)
  }, [])

  // ── Document state ────────────────────────────────────────────────────────
  // Trace document under undo/redo history (Cmd/Ctrl+Z, Shift/Y to redo). Each
  // discrete action (reorder, show/hide, delete, import, the fit's view change)
  // pushes one step; continuous edits (typing a name, dragging the width slider /
  // colour) coalesce into ONE step via a per-control key so undo isn't flooded.
  const tracesHistory = useHistory<Trace[]>([])
  const traces = tracesHistory.state
  const historySet = tracesHistory.set
  const historyReset = tracesHistory.reset
  const historyUndo = tracesHistory.undo
  const historyRedo = tracesHistory.redo
  const editKeyRef = React.useRef<string | null>(null)
  const setTraces = React.useCallback(
    (
      updater: Trace[] | ((prev: Trace[]) => Trace[]),
      coalesceKey: string | null = null,
    ) => {
      const push = coalesceKey === null || editKeyRef.current !== coalesceKey
      editKeyRef.current = coalesceKey
      historySet(updater, { history: push })
    },
    [historySet],
  )
  const [type, setType] = React.useState<MeasurementType>('PL')
  const [xMode, setXMode] = React.useState<AxisMode>('nm')
  const [laserNm, setLaserNm] = React.useState<number>(532)
  // Raman X data: 'cm' = already Raman shift cm⁻¹ (plot as-is, the common case),
  // 'nm' = scattered wavelength to convert via the laser.
  const [ramanInput, setRamanInput] = React.useState<'cm' | 'nm'>('cm')
  const [doNormalize, setDoNormalize] = React.useState(false)
  const [legend, setLegend] = React.useState<LegendLayout>({ ...DEFAULT_LEGEND })
  const [baselineMode, setBaselineMode] = React.useState<BaselineMode>('none')
  // Manual axis bounds (undefined = autoscale). In current plot units; reset
  // when the measurement type or X unit changes (which changes those units).
  const [range, setRange] = React.useState<AxisRange>({})
  const [xLog, setXLog] = React.useState(false)
  const [yLog, setYLog] = React.useState(false)

  // Raman strain readout references/coefficients (editable, persisted) + the
  // chosen reference (BULK_REF or a trace id; defaults to the first trace).
  const [strainRefs, setStrainRefs] =
    React.useState<StrainRefs>(DEFAULT_STRAIN_REFS)
  const [strainRef, setStrainRef] = React.useState<string>('')

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
    traceId: string
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

  // Refresh the saved-session list when data is imported / cleared elsewhere
  // (e.g. the system menu), so the switcher reflects it without a reload.
  React.useEffect(() => onDataChange(() => void refreshSessions()), [refreshSessions])

  // ── Autosave the current session ──────────────────────────────────────────
  const session = React.useMemo<AnalyzeSession>(() => {
    const style: PlotStyle = {
      ...DEFAULT_PLOT_STYLE,
      legend,
      axisMode: xMode,
      laserNm,
      ramanInput,
      normalize: doNormalize,
      baselineMode,
      xMin: range.xMin,
      xMax: range.xMax,
      yMin: range.yMin,
      yMax: range.yMax,
      xLog,
      yLog,
      fpL,
      fpMinWl,
      fpMaxWl,
      hcEvNm: hc,
      ramanK,
      strainSiRef: strainRefs.siRef,
      strainGeRef: strainRefs.geRef,
      strainSiCoef: strainRefs.siCoef,
      strainGeCoef: strainRefs.geCoef,
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
    ramanInput,
    doNormalize,
    baselineMode,
    range,
    xLog,
    yLog,
    fpL,
    fpMinWl,
    fpMaxWl,
    hc,
    ramanK,
    strainRefs,
  ])

  const persist = React.useCallback(
    async (s: AnalyzeSession) => {
      // Don't create empty projects: skip a session with no traces that was
      // never saved (e.g. a fresh tab). Once it has data (or already exists),
      // keep saving — so clearing a real project still persists.
      const alreadySaved = sessions.some((x) => x.id === s.id)
      if (s.traces.length === 0 && !alreadySaved) return
      await saveAnalyzeSession(s)
      if (projectParamRef.current !== s.id) void setProjectParam(s.id)
      logEvent(t('analyze.savedLog', { name: s.name }))
      void refreshSessions()
    },
    [refreshSessions, sessions, setProjectParam, t],
  )

  const { status } = useAutosave(session, persist)

  // ── Session actions ───────────────────────────────────────────────────────
  const applySession = React.useCallback((s: AnalyzeSession) => {
    setSessionId(s.id)
    setSessionName(s.name)
    editKeyRef.current = null
    historyReset(s.traces ?? []) // loading a project clears the undo stack
    setType(s.type ?? 'PL')
    setXMode(s.style?.axisMode ?? 'nm')
    setLaserNm(s.style?.laserNm ?? 532)
    setRamanInput(s.style?.ramanInput ?? 'cm')
    setDoNormalize(s.style?.normalize ?? false)
    setLegend(s.style?.legend ?? { ...DEFAULT_LEGEND })
    setBaselineMode(s.style?.baselineMode ?? 'none')
    setRange({
      xMin: s.style?.xMin,
      xMax: s.style?.xMax,
      yMin: s.style?.yMin,
      yMax: s.style?.yMax,
    })
    setXLog(s.style?.xLog ?? false)
    setYLog(s.style?.yLog ?? false)
    setFpL(s.style?.fpL ?? DEFAULT_FP_OPTIONS.L)
    setFpMinWl(s.style?.fpMinWl ?? DEFAULT_FP_OPTIONS.minWl)
    setFpMaxWl(s.style?.fpMaxWl ?? DEFAULT_FP_OPTIONS.maxWl)
    setHc(s.style?.hcEvNm ?? DEFAULT_HC_EV_NM)
    setRamanK(s.style?.ramanK ?? DEFAULT_RAMAN_K)
    setStrainRefs({
      siRef: s.style?.strainSiRef ?? DEFAULT_STRAIN_REFS.siRef,
      geRef: s.style?.strainGeRef ?? DEFAULT_STRAIN_REFS.geRef,
      siCoef: s.style?.strainSiCoef ?? DEFAULT_STRAIN_REFS.siCoef,
      geCoef: s.style?.strainGeCoef ?? DEFAULT_STRAIN_REFS.geCoef,
    })
    setFit(null)
    setFpFit(null)
    setOverlay(false)
  }, [historyReset])

  const handleSelect = React.useCallback(
    async (id: string) => {
      if (id === sessionId) return
      try {
        const s = await loadAnalyzeSession(id)
        if (s) {
          applySession(s)
          void setProjectParam(s.id)
          logEvent(t('analyze.loadedLog', { name: s.name }))
        }
      } catch {
        toast.error(t('analyze.loadFailed'))
      }
    },
    [sessionId, applySession, setProjectParam, t],
  )

  const handleCreateNew = React.useCallback(() => {
    applySession(freshSession(locale))
    // Clear the URL param; autosave will set it once the fresh session is persisted.
    void setProjectParam(null)
  }, [applySession, locale, setProjectParam])

  const handleRename = React.useCallback((name: string) => {
    setSessionName(name)
  }, [])

  const handleDelete = React.useCallback(
    async (id: string) => {
      try {
        await deleteAnalyzeSession(id)
        logEvent(t('analyze.deletedLog'))
        await refreshSessions()
        if (id === sessionId) applySession(freshSession(locale))
        toast.success(t('analyze.deleted'))
      } catch {
        toast.error(t('analyze.deleteFailed'))
      }
    },
    [sessionId, refreshSessions, applySession, locale, t],
  )

  // ── URL ⇄ state ───────────────────────────────────────────────────────────
  // Resume ONCE on mount from an explicit ?project URL.
  const hydrateInitialProject = React.useEffectEvent(
    async (target: string, isAlive: () => boolean) => {
      if (target === sessionId || !isAlive()) return
      try {
        const s = await loadAnalyzeSession(target)
        if (isAlive()) {
          if (s) {
            applySession(s)
            void setProjectParam(s.id)
            logEvent(t('analyze.loadedLog', { name: s.name }))
          } else if (projectParamRef.current) {
            void setProjectParam(null)
          }
        }
      } catch {
        // Load failures are non-fatal; keep the current session.
      }
    },
  )

  React.useEffect(() => {
    let alive = true
    const target = projectParamRef.current
    if (target) void hydrateInitialProject(target, () => alive)
    return () => {
      alive = false
    }
  }, [])

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
    [setTraces, fpMinWl, fpMaxWl],
  )

  // Renaming a trace coalesces consecutive keystrokes (same id) into one undo
  // step; the first keystroke captures the pre-edit name.
  const handleTraceRename = React.useCallback(
    (id: string, name: string) => {
      setTraces(
        (prev) => prev.map((t) => (t.id === id ? { ...t, name } : t)),
        `name:${id}`,
      )
    },
    [setTraces],
  )

  // Independent visibility: traces overlay freely. Clicking a trace toggles only
  // that trace, so any combination can be shown at once.
  const handleToggle = React.useCallback(
    (id: string) => {
      setTraces((prev) =>
        prev.map((t) => (t.id === id ? { ...t, visible: !t.visible } : t)),
      )
    },
    [setTraces],
  )

  const handleRemove = React.useCallback(
    (id: string) => {
      setTraces((prev) => prev.filter((t) => t.id !== id))
    },
    [setTraces],
  )

  // Drag / keyboard reorder. List order drives the legend order (top→down), the
  // fit target (first visible trace), and the SVG draw order (first drawn first,
  // so lower rows render on top). Persisted with the session like any edit.
  const handleReorder = React.useCallback(
    (next: Trace[]) => {
      setTraces(next)
    },
    [setTraces],
  )

  // Colour / line-width drags coalesce per trace into one undo step.
  const handleColor = React.useCallback(
    (id: string, color: string) => {
      setTraces(
        (prev) => prev.map((t) => (t.id === id ? { ...t, color } : t)),
        `color:${id}`,
      )
    },
    [setTraces],
  )

  const handleLineWidth = React.useCallback((id: string, lineWidth: number) => {
    setTraces(
      (prev) => prev.map((t) => (t.id === id ? { ...t, lineWidth } : t)),
      `lw:${id}`,
    )
  }, [setTraces])

  // Undo / redo (Cmd/Ctrl+Z, Shift+Z or Ctrl+Y to redo). While typing in a field
  // we defer to the browser's native text undo, matching the mask tool. Resetting
  // the coalesce key ensures the next edit after an undo starts a fresh step.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      const typing =
        !!el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.isContentEditable)
      const mod = e.metaKey || e.ctrlKey
      if (mod && (e.key === 'z' || e.key === 'Z')) {
        if (typing) return
        e.preventDefault()
        editKeyRef.current = null
        if (e.shiftKey) historyRedo()
        else historyUndo()
      } else if (mod && (e.key === 'y' || e.key === 'Y')) {
        if (typing) return
        e.preventDefault()
        editKeyRef.current = null
        historyRedo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [historyUndo, historyRedo])

  // Changing the measurement type or X unit changes the axis units, so any
  // manual range no longer applies — drop it (both axes for type, X for unit).
  const handleType = React.useCallback((t: MeasurementType) => {
    setType(t)
    setRange({})
  }, [])
  const handleXMode = React.useCallback((m: AxisMode) => {
    setXMode(m)
    setRange((r) => ({ ...r, xMin: undefined, xMax: undefined }))
  }, [])
  // cm⁻¹ ↔ nm-conversion changes the X values, so drop any manual X range.
  const handleRamanInput = React.useCallback((v: 'cm' | 'nm') => {
    setRamanInput(v)
    setRange((r) => ({ ...r, xMin: undefined, xMax: undefined }))
  }, [])

  // ── Derived transforms ────────────────────────────────────────────────────
  const transformOpts = React.useMemo(
    () => ({ xMode, laserNm, xIsWavelength: ramanInput === 'nm', hc, ramanK }),
    [xMode, laserNm, ramanInput, hc, ramanK],
  )

  const axisInfo = React.useMemo(
    () => transformX([], type, transformOpts),
    [type, transformOpts],
  )

  // Identifies the coordinate space a fit was computed in. If it changes, any
  // cached fit results no longer apply and are ignored.
  const fitSignature = `${type}|${xMode}|${laserNm}|${doNormalize}|${baselineMode}`

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

  // Strain readout works on the visible traces in plot units (cm⁻¹). The
  // reference defaults to the first trace (sample-relative) unless the user
  // picks "bulk" or another sample; falls back if the chosen trace disappears.
  const strainTraces = React.useMemo(
    () => plotTraces.map((t) => ({ id: t.id, name: t.name, x: t.x, y: t.y })),
    [plotTraces],
  )
  const effectiveStrainRef =
    strainRef === BULK_REF || strainTraces.some((t) => t.id === strainRef)
      ? strainRef
      : (strainTraces[0]?.id ?? BULK_REF)

  // A fit belongs to the trace it was computed on (the topmost visible one =
  // plotTraces[0]). Its results + dashed overlay apply only while BOTH the
  // coordinate space (signature) AND that trace are unchanged — so toggling or
  // reordering can never draw one trace's fit on top of another. The status
  // message is gated on signature only, so "no target" / "failed" notices still
  // show regardless of which trace is currently on top.
  const fitCurrent = fit && fit.signature === fitSignature ? fit : null
  const fitMatchesTrace = !!fit && fit.traceId === plotTraces[0]?.id
  const results = React.useMemo(
    () => (fitCurrent && fitMatchesTrace ? fitCurrent.results : []),
    [fitCurrent, fitMatchesTrace],
  )
  const fitMessage = fitCurrent?.message ?? null

  // Fit curve drawn as a dashed overlay, sampled on the first visible trace's X.
  const fitOverlay = React.useMemo<PlotOverlay | undefined>(() => {
    if (!overlay || results.length === 0 || plotTraces.length === 0) {
      return undefined
    }
    const base = plotTraces[0]
    const fy = fitCurve(base.x, results, model)
    return { x: base.x.slice(), y: fy, color: FIT_COLOR }
  }, [overlay, results, plotTraces, model])

  // Autoscale domain AS DRAWN (nice-rounded). Seeds the manual-range fields /
  // slider so switching off "自動" matches the shown axis exactly (no jump).
  const autoDomain = React.useMemo(() => {
    const domains = resolvePlotDomains({
      traces: plotTraces.filter((trace) => trace.visible && trace.x.length > 0),
      overlays: analysisType === 'peak' && fitOverlay ? [fitOverlay] : [],
      xLog,
      yLog,
      xMin: range.xMin,
      xMax: range.xMax,
      yMin: range.yMin,
      yMax: range.yMax,
    })
    return { x: domains.shownX, y: domains.shownY }
  }, [
    analysisType,
    fitOverlay,
    plotTraces,
    range.xMax,
    range.xMin,
    range.yMax,
    range.yMin,
    xLog,
    yLog,
  ])
  const xAuto = autoDomain.x
  const yAuto = autoDomain.y

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
  const pxpOverlay =
    analysisType === 'peak' && fitOverlay ? fitOverlay : undefined
  const pxpDomains = React.useMemo(
    () =>
      resolvePlotDomains({
        traces: plotTraces,
        overlays: pxpOverlay ? [pxpOverlay] : [],
        xLog,
        yLog,
        xMin: range.xMin,
        xMax: range.xMax,
        yMin: range.yMin,
        yMax: range.yMax,
      }),
    [
      plotTraces,
      pxpOverlay,
      xLog,
      yLog,
      range.xMin,
      range.xMax,
      range.yMin,
      range.yMax,
    ],
  )

  // ── Fit ───────────────────────────────────────────────────────────────────
  const handleFit = React.useCallback(() => {
    if (!fitTarget || fitTarget.x.length < 3) {
      setFit({
        signature: fitSignature,
        traceId: fitTarget?.id ?? '',
        results: [],
        message: t('analyze.noFitTarget'),
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
          traceId: fitTarget.id,
          results: found,
          message: found.length === 0 ? t('analyze.noPeaks') : null,
        })
        if (found.length > 0) {
          setOverlay(true)
          logEvent(t('analyze.peakFitLog', { count: found.length }))
        }
      } catch {
        setFit({
          signature: fitSignature,
          traceId: fitTarget.id,
          results: [],
          message: t('analyze.fitFailed'),
        })
      } finally {
        setFitting(false)
      }
    }, 0)
  }, [
    setTraces,
    fitTarget,
    model,
    fitSignature,
    type,
    transformOpts,
    baselineMode,
    doNormalize,
    t,
  ])

  // ── FP fit ──────────────────────────────────────────────────────────────
  const handleFpFit = React.useCallback(() => {
    if (!fitTarget || fitTarget.x.length < 5) {
      setFpFit({
        traceId: fitTarget?.id ?? '',
        fit: null,
        message: t('analyze.noFitTarget'),
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
        }
        const res = fitFp(rawX, rawY, opts)
        if (res.ok) {
          setFpFit({ traceId, fit: res.fit, message: null })
          logEvent(t('analyze.fpFitLog', { value: res.fit.ngFp.toFixed(3) }))
        } else {
          setFpFit({ traceId, fit: null, message: res.error })
        }
      } catch {
        setFpFit({ traceId, fit: null, message: t('analyze.fitFailed') })
      } finally {
        setFpFitting(false)
      }
    }, 0)
  }, [setTraces, fitTarget, fpAdvanced, fpL, fpMinWl, fpMaxWl, t])

  const getSvg = React.useCallback(() => svgRef.current, [])

  const switcherItems = React.useMemo(
    () => sessions.map((s) => ({ id: s.id, name: s.name })),
    [sessions],
  )

  React.useEffect(() => {
    const onAction = (event: Event) => {
      const detail = (event as CustomEvent<WebMcpActionRequest>).detail
      if (!detail?.type.startsWith('analyze.')) return
      detail.handled = true

      void (async () => {
        const params = isRecord(detail.payload) ? detail.payload : {}
        const saveNext = async (next: AnalyzeSession) => {
          await saveAnalyzeSession(next)
          await refreshSessions()
          return summarizeAnalyzeSession(next)
        }

        switch (detail.type) {
          case 'analyze.get_state': {
            detail.resolve({
              handled: true,
              session: summarizeAnalyzeSession(session),
              fit: fitCurrent,
              fpFit: fpFitCurrent,
              canFit,
              canFitFp,
            })
            return
          }

          case 'analyze.create_project': {
            const fresh = freshSession(locale)
            if (typeof params.name === 'string' && params.name.trim()) {
              fresh.name = params.name.trim()
            }
            applySession(fresh)
            void setProjectParam(fresh.id)
            detail.resolve({
              handled: true,
              created: true,
              session: await saveNext(fresh),
            })
            return
          }

          case 'analyze.rename_project': {
            const name =
              typeof params.name === 'string' && params.name.trim()
                ? params.name.trim()
                : null
            if (!name) throw new Error('name must be a non-empty string')
            setSessionName(name)
            const next = { ...session, name }
            detail.resolve({
              handled: true,
              renamed: true,
              session: await saveNext(next),
            })
            return
          }

          case 'analyze.delete_project': {
            const projectId =
              typeof params.projectId === 'string' && params.projectId.trim()
                ? params.projectId.trim()
                : sessionId
            await deleteAnalyzeSession(projectId)
            await refreshSessions()
            if (projectId === sessionId) applySession(freshSession(locale))
            detail.resolve({ handled: true, deleted: true, projectId })
            return
          }

          case 'analyze.import_trace_text': {
            const text = typeof params.text === 'string' ? params.text : null
            if (!text) throw new Error('text must be a non-empty string')
            const fileName =
              typeof params.fileName === 'string' && params.fileName.trim()
                ? params.fileName.trim()
                : `trace-${traces.length + 1}.txt`
            const parsed = parseSpectrumText(text, fileName)
            const seen = new Set(traces.map((trace) => trace.id))
            let id = `${parsed.name}-${traces.length}`
            let n = 1
            while (seen.has(id)) id = `${parsed.name}-${traces.length}-${n++}`
            const trace: Trace = {
              id,
              name: parsed.name,
              x: parsed.x,
              y: parsed.y,
              color: TRACE_COLORS[traces.length % TRACE_COLORS.length],
              visible: true,
              lineWidth: DEFAULT_LINE_WIDTH,
            }
            const nextType = parseMeasurementType(params.type) ?? type
            const nextTraces = [...traces, trace]
            historyReset(nextTraces)
            setType(nextType)
            const next = { ...session, traces: nextTraces, type: nextType }
            detail.resolve({
              handled: true,
              imported: true,
              trace: {
                id: trace.id,
                name: trace.name,
                points: Math.min(trace.x.length, trace.y.length),
              },
              session: await saveNext(next),
            })
            return
          }

          case 'analyze.update_settings': {
            const nextStyle: PlotStyle = { ...session.style }
            let nextType = type

            const requestedType = parseMeasurementType(params.type)
            if (requestedType) {
              nextType = requestedType
              setType(requestedType)
              setRange({})
              nextStyle.xMin = undefined
              nextStyle.xMax = undefined
              nextStyle.yMin = undefined
              nextStyle.yMax = undefined
            }

            const requestedXMode = parseAxisMode(params.xMode)
            if (requestedXMode) {
              setXMode(requestedXMode)
              nextStyle.axisMode = requestedXMode
              nextStyle.xMin = undefined
              nextStyle.xMax = undefined
              setRange((cur) => ({ ...cur, xMin: undefined, xMax: undefined }))
            }

            const requestedRamanInput =
              params.ramanInput === 'cm' || params.ramanInput === 'nm'
                ? params.ramanInput
                : null
            if (requestedRamanInput) {
              setRamanInput(requestedRamanInput)
              nextStyle.ramanInput = requestedRamanInput
              nextStyle.xMin = undefined
              nextStyle.xMax = undefined
              setRange((cur) => ({ ...cur, xMin: undefined, xMax: undefined }))
            }

            const laser = finiteNumber(params.laserNm)
            if (laser !== null) {
              setLaserNm(laser)
              nextStyle.laserNm = laser
            }
            if (typeof params.normalize === 'boolean') {
              setDoNormalize(params.normalize)
              nextStyle.normalize = params.normalize
            }
            const requestedBaseline = parseBaselineMode(params.baselineMode)
            if (requestedBaseline) {
              setBaselineMode(requestedBaseline)
              nextStyle.baselineMode = requestedBaseline
            }
            if (typeof params.xLog === 'boolean') {
              setXLog(params.xLog)
              nextStyle.xLog = params.xLog
            }
            if (typeof params.yLog === 'boolean') {
              setYLog(params.yLog)
              nextStyle.yLog = params.yLog
            }
            const xMin = finiteNumber(params.xMin)
            const xMax = finiteNumber(params.xMax)
            const yMin = finiteNumber(params.yMin)
            const yMax = finiteNumber(params.yMax)
            if (
              xMin !== null ||
              xMax !== null ||
              yMin !== null ||
              yMax !== null
            ) {
              const nextRange = {
                xMin: xMin ?? range.xMin,
                xMax: xMax ?? range.xMax,
                yMin: yMin ?? range.yMin,
                yMax: yMax ?? range.yMax,
              }
              setRange(nextRange)
              nextStyle.xMin = nextRange.xMin
              nextStyle.xMax = nextRange.xMax
              nextStyle.yMin = nextRange.yMin
              nextStyle.yMax = nextRange.yMax
            }
            if (isRecord(params.legend)) {
              const nextLegend = { ...legend }
              const lx = finiteNumber(params.legend.x)
              const ly = finiteNumber(params.legend.y)
              const scale = finiteNumber(params.legend.scale)
              if (lx !== null) nextLegend.x = lx
              if (ly !== null) nextLegend.y = ly
              if (scale !== null) nextLegend.scale = scale
              if (typeof params.legend.visible === 'boolean') {
                nextLegend.visible = params.legend.visible
              }
              setLegend(nextLegend)
              nextStyle.legend = nextLegend
            }
            const fpLength = finiteNumber(params.fpL)
            const fpMin = finiteNumber(params.fpMinWl)
            const fpMax = finiteNumber(params.fpMaxWl)
            if (fpLength !== null) {
              setFpL(fpLength)
              nextStyle.fpL = fpLength
            }
            if (fpMin !== null) {
              setFpMinWl(fpMin)
              nextStyle.fpMinWl = fpMin
            }
            if (fpMax !== null) {
              setFpMaxWl(fpMax)
              nextStyle.fpMaxWl = fpMax
            }
            const hcNext = finiteNumber(params.hcEvNm)
            const ramanKNext = finiteNumber(params.ramanK)
            if (hcNext !== null) {
              setHc(hcNext)
              nextStyle.hcEvNm = hcNext
            }
            if (ramanKNext !== null) {
              setRamanK(ramanKNext)
              nextStyle.ramanK = ramanKNext
            }

            const next = { ...session, type: nextType, style: nextStyle }
            detail.resolve({
              handled: true,
              updated: true,
              session: await saveNext(next),
            })
            return
          }

          case 'analyze.update_trace': {
            const traceId =
              typeof params.traceId === 'string' ? params.traceId : null
            if (!traceId) throw new Error('traceId is required')
            if (!isRecord(params.patch)) throw new Error('patch must be an object')
            const patch = params.patch
            const nextTraces = traces.map((trace) => {
              if (trace.id !== traceId) return trace
              return {
                ...trace,
                name:
                  typeof patch.name === 'string'
                    ? patch.name
                    : trace.name,
                visible:
                  typeof patch.visible === 'boolean'
                    ? patch.visible
                    : trace.visible,
                color:
                  typeof patch.color === 'string'
                    ? patch.color
                    : trace.color,
                lineWidth:
                  finiteNumber(patch.lineWidth) ?? trace.lineWidth,
              }
            })
            setTraces(nextTraces)
            const next = { ...session, traces: nextTraces }
            detail.resolve({
              handled: true,
              updated: true,
              session: await saveNext(next),
            })
            return
          }

          case 'analyze.delete_trace': {
            const traceId =
              typeof params.traceId === 'string' ? params.traceId : null
            if (!traceId) throw new Error('traceId is required')
            const nextTraces = traces.filter((trace) => trace.id !== traceId)
            setTraces(nextTraces)
            const next = { ...session, traces: nextTraces }
            detail.resolve({
              handled: true,
              deleted: true,
              traceId,
              session: await saveNext(next),
            })
            return
          }

          case 'analyze.reorder_traces': {
            const orderedIds = Array.isArray(params.orderedIds)
              ? params.orderedIds.filter((id): id is string => typeof id === 'string')
              : []
            if (orderedIds.length === 0) throw new Error('orderedIds is required')
            const byId = new Map(traces.map((trace) => [trace.id, trace]))
            const reordered = orderedIds
              .map((id) => byId.get(id))
              .filter((trace): trace is Trace => !!trace)
            const rest = traces.filter((trace) => !orderedIds.includes(trace.id))
            const nextTraces = [...reordered, ...rest]
            setTraces(nextTraces)
            const next = { ...session, traces: nextTraces }
            detail.resolve({
              handled: true,
              reordered: true,
              session: await saveNext(next),
            })
            return
          }

          case 'analyze.run_peak_fit': {
            const selectedModel = parsePeakModel(params.model) ?? model
            const maxPeaks = finiteNumber(params.maxPeaks)
            if (!fitTarget || fitTarget.x.length < 3) {
              detail.resolve({ handled: true, fit: [], message: t('analyze.noFitTarget') })
              return
            }
            setModel(selectedModel)
            const nextTraces = traces.map((trace) => ({
              ...trace,
              visible: trace.id === fitTarget.id,
            }))
            setTraces(nextTraces)
            const { x } = transformX(fitTarget.x, type, transformOpts)
            const yBase = baseline(fitTarget.y, baselineMode, fitTarget.x)
            const y = doNormalize ? normalize(yBase) : yBase
            const found = fitPeaks(x, y, {
              model: selectedModel,
              maxPeaks: maxPeaks && maxPeaks > 0 ? Math.round(maxPeaks) : 8,
            })
            setFit({
              signature: fitSignature,
              traceId: fitTarget.id,
              results: found,
              message: found.length === 0 ? t('analyze.noPeaks') : null,
            })
            setOverlay(params.overlay === false ? false : found.length > 0)
            const next = { ...session, traces: nextTraces }
            await saveNext(next)
            detail.resolve({
              handled: true,
              fit: found,
              message: found.length === 0 ? t('analyze.noPeaks') : null,
            })
            return
          }

          case 'analyze.run_fp_fit': {
            if (!fitTarget || fitTarget.x.length < 5) {
              detail.resolve({ handled: true, fit: null, message: t('analyze.noFitTarget') })
              return
            }
            const opts: FpOptions = {
              ...DEFAULT_FP_OPTIONS,
              ...fpAdvanced,
              L: finiteNumber(params.L) ?? fpL,
              minWl: finiteNumber(params.minWl) ?? fpMinWl,
              maxWl: finiteNumber(params.maxWl) ?? fpMaxWl,
            }
            const nextTraces = traces.map((trace) => ({
              ...trace,
              visible: trace.id === fitTarget.id,
            }))
            setTraces(nextTraces)
            setAnalysisType('fp')
            setFpL(opts.L)
            setFpMinWl(opts.minWl)
            setFpMaxWl(opts.maxWl)
            const res = fitFp(fitTarget.x, fitTarget.y, opts)
            if (res.ok) {
              setFpFit({ traceId: fitTarget.id, fit: res.fit, message: null })
              detail.resolve({ handled: true, fit: res.fit, message: null })
            } else {
              setFpFit({ traceId: fitTarget.id, fit: null, message: res.error })
              detail.resolve({ handled: true, fit: null, message: res.error })
            }
            await saveNext({ ...session, traces: nextTraces })
            return
          }

          case 'analyze.export_png': {
            const svg = svgRef.current
            if (!svg) throw new Error('No rendered plot is available')
            const filename =
              typeof params.filename === 'string' && params.filename.trim()
                ? params.filename.trim()
                : `${sessionName.trim() || 'spectrum'}.png`
            await exportPng(svg, filename, finiteNumber(params.scale) ?? 2)
            detail.resolve({ handled: true, exported: true, format: 'png', filename })
            return
          }

          case 'analyze.export_pxp': {
            if (plotTraces.length === 0) throw new Error('No visible traces to export')
            const filename =
              typeof params.filename === 'string' && params.filename.trim()
                ? params.filename.trim()
                : `${sessionName.trim() || 'spectrum'}.pxp`
            const blob = buildPxp(plotTraces, {
              xLabel: xAxisLabel,
              yLabel,
              xMin: pxpDomains.drawnX[0],
              xMax: pxpDomains.drawnX[1],
              yMin: pxpDomains.drawnY[0],
              yMax: pxpDomains.drawnY[1],
              xLog,
              yLog,
              legend,
              overlays:
                pxpOverlay
                  ? [
                      {
                        name: 'fit',
                        x: pxpOverlay.x,
                        y: pxpOverlay.y,
                        color: pxpOverlay.color,
                        lineWidth: 2,
                        lineStyle: 3,
                      },
                    ]
                  : undefined,
              verticalLines: analysisType === 'fp' ? fpVerticalLines : undefined,
              verticalLineLabel:
                analysisType === 'fp' && fpVerticalLines
                  ? t('analyze.fpResonance')
                  : undefined,
            })
            downloadBlob(blob, filename)
            detail.resolve({
              handled: true,
              exported: true,
              format: 'pxp',
              filename,
              bytes: blob.size,
            })
            return
          }

          default:
            detail.resolve({ handled: false, error: `Unknown action ${detail.type}` })
        }
      })().catch((error) => {
        detail.reject(summarizeError(error))
      })
    }

    window.addEventListener(WEBMCP_ACTION_EVENT, onAction)
    return () => window.removeEventListener(WEBMCP_ACTION_EVENT, onAction)
  }, [
    analysisType,
    applySession,
    baselineMode,
    canFit,
    canFitFp,
    doNormalize,
    fitCurrent,
    fitSignature,
    fitTarget,
    fpAdvanced,
    fpFitCurrent,
    fpMaxWl,
    fpMinWl,
    fpL,
    fpVerticalLines,
    historyReset,
    legend,
    locale,
    model,
    plotTraces,
    pxpDomains.drawnX,
    pxpDomains.drawnY,
    pxpOverlay,
    range.xMax,
    range.xMin,
    range.yMax,
    range.yMin,
    refreshSessions,
    session,
    sessionId,
    sessionName,
    setProjectParam,
    setTraces,
    t,
    traces,
    transformOpts,
    type,
    xAxisLabel,
    xLog,
    yLabel,
    yLog,
  ])

  const panel = (
    <div className="flex min-h-0 flex-1 flex-col">
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
          <SectionLabel>{t('analyze.spectrum')}</SectionLabel>
          <FileDrop onTraces={handleTraces} onType={handleType} />
          <div className="flex items-center justify-between pt-1">
            <SectionLabel>{t('analyze.traces')}</SectionLabel>
            <span className="tnum text-xs text-muted-foreground">
              {traces.length}
            </span>
          </div>
          <TraceList
            traces={traces}
            onReorder={handleReorder}
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
          <SectionLabel>{t('analyze.measureAxis')}</SectionLabel>
          <AxisControls
            type={type}
            onType={handleType}
            xMode={xMode}
            onXMode={handleXMode}
            laserNm={laserNm}
            onLaserNm={setLaserNm}
            ramanInput={ramanInput}
            onRamanInput={handleRamanInput}
            normalize={doNormalize}
            onNormalize={setDoNormalize}
            legendVisible={legend.visible}
            onLegendVisible={(v) => setLegend((l) => ({ ...l, visible: v }))}
            baselineMode={baselineMode}
            onBaselineMode={setBaselineMode}
          />
          <RangeControls
            range={range}
            xAuto={xAuto}
            yAuto={yAuto}
            onChange={setRange}
            xLog={xLog}
            yLog={yLog}
            onXLog={setXLog}
            onYLog={setYLog}
          />
        </section>

        {/* 4 — Peak analysis (collapsed) */}
        <Accordion>
          <AccordionItem value="peak" className="border-t border-border">
            <AccordionTrigger variant="section">{t('analyze.peakAnalysis')}</AccordionTrigger>
            <AccordionContent>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-muted-foreground">{t('analyze.analysisType')}</span>
                  <ToggleGroup
                    variant="outline"
                    size="sm"
                    spacing={0}
                    value={[analysisType]}
                    onValueChange={(v) => {
                      const next = v[0] as 'peak' | 'fp' | undefined
                      if (next) setAnalysisType(next)
                    }}
                    aria-label={t('analyze.analysisType')}
                    className="w-full"
                  >
                    <ToggleGroupItem value="peak" className="flex-1">
                      {t('analyze.peak')}
                    </ToggleGroupItem>
                    <ToggleGroupItem value="fp" className="flex-1">
                      {t('analyze.fpResonance')}
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
              </div>
            </AccordionContent>
          </AccordionItem>
          {type === 'Raman' && (
            <AccordionItem value="strain" className="border-t border-border">
              <AccordionTrigger variant="section">{t('analyze.strain')}</AccordionTrigger>
              <AccordionContent>
                <StrainPanel
                  traces={strainTraces}
                  refs={strainRefs}
                  onRefs={setStrainRefs}
                  refMode={effectiveStrainRef}
                  onRefMode={setStrainRef}
                />
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>

        {/* 6 — Calibration: editable formula constants (collapsed) */}
        <Accordion>
          <AccordionItem value="calc" className="border-t border-border">
            <AccordionTrigger variant="section">{t('analyze.calibration')}</AccordionTrigger>
            <AccordionContent>
              <CalcCalibration
                hc={hc}
                onHc={setHc}
                ramanK={ramanK}
                onRamanK={setRamanK}
                onReset={() => {
                  setHc(DEFAULT_HC_EV_NM)
                  setRamanK(DEFAULT_RAMAN_K)
                }}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>

      </div>

      {/* 6 — Export */}
      <div className="flex flex-col gap-2 border-t border-border p-4">
        <SectionLabel>{t('analyze.export')}</SectionLabel>
        <ExportButtons
          getSvg={getSvg}
          getTraces={() => plotTraces}
          getPxpOptions={() => ({
            xLabel: xAxisLabel,
            yLabel,
            xMin: pxpDomains.drawnX[0],
            xMax: pxpDomains.drawnX[1],
            yMin: pxpDomains.drawnY[0],
            yMax: pxpDomains.drawnY[1],
            xLog,
            yLog,
            legend,
            overlays:
              pxpOverlay
                ? [
                    {
                      name: 'fit',
                      x: pxpOverlay.x,
                      y: pxpOverlay.y,
                      color: pxpOverlay.color,
                      lineWidth: 2,
                      lineStyle: 3,
                    },
                  ]
                : undefined,
            verticalLines:
              analysisType === 'fp' ? fpVerticalLines : undefined,
            verticalLineLabel:
              analysisType === 'fp' && fpVerticalLines
                ? t('analyze.fpResonance')
                : undefined,
          })}
          baseName={sessionName.trim() || 'spectrum'}
          disabled={plotTraces.length === 0}
          className="w-full"
        />
      </div>
    </div>
  )

  return (
    <ToolLayout panel={panel} panelTitle={t('analyze.panelTitle')} panelWidth={320}>
      {/* CENTER: the publication plot only */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background p-4">
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto">
          {plotTraces.length === 0 ? null : (
            <PlotView
              ref={svgRef}
              traces={plotTraces}
              overlay={analysisType === 'peak' ? fitOverlay : undefined}
              verticalLines={fpVerticalLines}
              verticalLineLabel={fpVerticalLines ? t('analyze.fpResonance') : undefined}
              xLabel={xAxisLabel}
              yLabel={yLabel}
              style={DEFAULT_PLOT_STYLE}
              xMin={range.xMin}
              xMax={range.xMax}
              yMin={range.yMin}
              yMax={range.yMax}
              xLog={xLog}
              yLog={yLog}
              legend={legend}
              onLegendChange={setLegend}
            />
          )}
        </div>
      </section>
    </ToolLayout>
  )
}

export default function AnalyzeToolPage(props: AnalyzeToolPageProps) {
  return useAnalyzeToolView(props)
}
