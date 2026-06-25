'use client'

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react'
import { FileDown, FileImage } from 'lucide-react'
import {
  Calibration,
  defaultCalibration,
  substrateWidthUm,
} from '@/modules/mask/calibration'
import {
  createDefaultDocument,
  MaskDocument,
  Polarity,
} from '@/modules/mask/document'
import { Shape, newId } from '@/modules/mask/shape'
import { downloadBmp } from '@/modules/mask/renderer'
import { downloadGds } from '@/modules/mask/gds'
import { importMaskFile } from '@/modules/mask/import'
import { Toolbar, ToolKind } from '@/modules/mask/components/Toolbar'
import { MaskCanvas } from '@/modules/mask/components/MaskCanvas'
import { Inspector } from '@/modules/mask/components/Inspector'
import { ToolDefaultsPanel } from '@/modules/mask/components/ToolDefaultsPanel'
import {
  DEFAULT_TOOL_DEFAULTS,
  isDefaultableTool,
  ToolDefaults,
} from '@/modules/mask/tool-defaults'
import {
  CalibrationPanel,
  GdsChipPanel,
} from '@/modules/mask/components/CalibrationPanel'
import { PolarityToggle } from '@/modules/mask/components/PolarityToggle'
import { Button } from '@/components/ui/button'
import { SectionLabel } from '@/components/app/SectionLabel'
import { ToolLayout } from '@/components/app/ToolLayout'
import { FileDropzone } from '@/components/app/FileDropzone'
import { useI18n } from '@/components/app/I18nProvider'
import {
  ProjectSwitcher,
  ProjectSwitcherItem,
} from '@/components/app/ProjectSwitcher'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { useAutosave } from '@/hooks/use-autosave'
import { useHistory } from '@/hooks/use-history'
import {
  deleteMaskDoc,
  listMaskDocs,
  loadMaskDoc,
  saveMaskDoc,
  onDataChange,
} from '@/lib/storage'
import { logEvent } from '@/lib/log'
import { shapeSchema } from '@/lib/schemas'
import {
  WEBMCP_ACTION_EVENT,
  summarizeError,
  type WebMcpActionRequest,
} from '@/lib/webmcp-actions'
import { toast } from 'sonner'

const initialCal = defaultCalibration()
type MaskPageMode = 'bmp' | 'gds'
const MIN_VIEW_ZOOM = 0.25
const MAX_VIEW_ZOOM = 4
const VIEW_ZOOM_STEP = 1.25

interface MaskToolPageProps {
  mode: MaskPageMode
  initialProjectId: string | null
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function summarizeMaskDocument(doc: MaskDocument) {
  return {
    id: doc.id,
    name: doc.name,
    widthUm: doc.widthUm,
    heightUm: doc.heightUm,
    magnification: doc.magnification,
    umPerCm: doc.umPerCm,
    target: doc.target,
    polarity: doc.polarity,
    shapeCount: doc.shapes.length,
    shapes: doc.shapes,
  }
}

function matchesMode(doc: MaskDocument, mode: MaskPageMode): boolean {
  return doc.target === mode
}

function projectSwitcherItems(
  docs: MaskDocument[],
  mode: MaskPageMode,
): ProjectSwitcherItem[] {
  const items: ProjectSwitcherItem[] = []
  for (const doc of docs) {
    if (matchesMode(doc, mode)) items.push({ id: doc.id, name: doc.name })
  }
  return items
}

function createModeDocument(
  mode: MaskPageMode,
  locale: Parameters<typeof createDefaultDocument>[1],
): MaskDocument {
  const cal = defaultCalibration()
  if (mode === 'gds') {
    return {
      ...createDefaultDocument(cal, locale, 'gds'),
      widthUm: 10000,
      heightUm: 10000,
    }
  }
  return createDefaultDocument(cal, locale, 'bmp')
}

function replaceProjectParam(projectId: string | null): void {
  const url = new URL(window.location.href)
  if (projectId) {
    url.searchParams.set('project', projectId)
  } else {
    url.searchParams.delete('project')
  }
  window.history.replaceState(
    window.history.state,
    '',
    `${url.pathname}${url.search}${url.hash}`,
  )
}

function parseIncomingShape(value: unknown): Shape {
  if (!isRecord(value)) throw new Error('shape must be an object')
  const kind = typeof value.kind === 'string' ? value.kind : 'shape'
  const withId = { ...value, id: typeof value.id === 'string' ? value.id : newId(`${kind}-`) }
  const parsed = shapeSchema.safeParse(withId)
  if (!parsed.success) throw new Error('shape does not match a supported mask shape')
  return parsed.data as Shape
}

function fileFromBase64(
  base64: string,
  fileName: string,
  mimeType = 'application/octet-stream',
): File {
  const clean = base64.includes(',') ? base64.split(',').pop() ?? '' : base64
  const binary = atob(clean)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new File([bytes], fileName, { type: mimeType })
}

function useMaskToolPageView({ mode, initialProjectId }: MaskToolPageProps) {
  const { locale, t } = useI18n()
  // DMD resolution is BMP-export hardware/session state. The layout dimensions
  // live in the document and are the GDS/canvas µm coordinate space.
  const [dmd, setDmd] = useState({ w: initialCal.dmdW, h: initialCal.dmdH })
  const history = useHistory<MaskDocument>(createModeDocument(mode, locale))
  const doc = history.state
  const isBmp = mode === 'bmp'

  // Calibration is derived from the BMP/DMD settings plus the document's
  // physical layout size. GDS uses the µm layout directly; BMP rasterization maps
  // that layout into the selected DMD pixel grid.
  const cal = useMemo<Calibration>(
    () => {
      const gdsDmdW = 1920
      const gdsDmdH =
        doc.widthUm > 0
          ? Math.max(1, Math.round(gdsDmdW * (doc.heightUm / doc.widthUm)))
          : 1920
      return {
        dmdW: isBmp ? dmd.w : gdsDmdW,
        dmdH: isBmp ? dmd.h : gdsDmdH,
        magnification: doc.magnification,
        umPerCm: doc.umPerCm,
        substrateWUm: doc.widthUm,
        substrateHUm: doc.heightUm,
      }
    },
    [
      dmd.w,
      dmd.h,
      doc.heightUm,
      doc.magnification,
      doc.umPerCm,
      doc.widthUm,
      isBmp,
    ],
  )

  const [tool, setTool] = useState<ToolKind>('select')
  const [viewZoom, setViewZoom] = useState(1)
  const [toolDefaults, setToolDefaults] = useState<ToolDefaults>(DEFAULT_TOOL_DEFAULTS)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [savedDocs, setSavedDocs] = useState<ProjectSwitcherItem[]>([])
  const [importingMask, setImportingMask] = useState(false)

  // Projection-scale edits update layout width and preserve the current layout
  // aspect. They use { history: false } — like the doc name — so the undo stack
  // isn't flooded per keystroke; they fold into the next real step.
  const handleMagnification = useCallback(
    (m: number) => {
      if (!(m > 0)) return
      history.set(
        (d) => {
          // µm/cm ∝ 1/magnification — preserve the optics' native scale.
          const constant = d.umPerCm * d.magnification
          const umPerCm = constant / m
          const widthUm = substrateWidthUm(umPerCm)
          return {
            ...d,
            target: 'bmp',
            magnification: m,
            umPerCm,
            widthUm,
            heightUm: widthUm * (dmd.h / dmd.w),
          }
        },
        { history: false },
      )
    },
    [history, dmd.h, dmd.w],
  )

  // Recalibrate: set µm-per-cm directly at the current magnification.
  const handleUmPerCm = useCallback(
    (u: number) => {
      if (!(u > 0)) return
      history.set(
        (d) => {
          const widthUm = substrateWidthUm(u)
          return {
            ...d,
            target: 'bmp',
            umPerCm: u,
            widthUm,
            heightUm: widthUm * (dmd.h / dmd.w),
          }
        },
        { history: false },
      )
    },
    [history, dmd.h, dmd.w],
  )

  const handleDmdChange = useCallback(
    (w: number, h: number) => {
      if (!(w > 0) || !(h > 0)) return
          const W = Math.round(w)
          const H = Math.round(h)
          setDmd({ w: W, h: H })
          history.set(
            (d) => {
              if (d.target !== 'bmp') return d
              return { ...d, heightUm: d.widthUm * (H / W) }
            },
            { history: false },
          )
    },
    [history],
  )

  const handleViewZoomTool = useCallback(
    (zoomTool: 'zoomIn' | 'zoomOut') => {
      setViewZoom((z) => {
        if (zoomTool === 'zoomIn') {
          return clamp(z * VIEW_ZOOM_STEP, MIN_VIEW_ZOOM, MAX_VIEW_ZOOM)
        }
        return clamp(z / VIEW_ZOOM_STEP, MIN_VIEW_ZOOM, MAX_VIEW_ZOOM)
      })
    },
    [],
  )

  const handleLayoutSize = useCallback(
    (widthUm: number, heightUm: number) => {
      if (!(widthUm > 0) || !(heightUm > 0)) return
      history.set(
        (d) => ({
          ...d,
          target: 'gds',
          widthUm,
          heightUm,
        }),
        { history: false },
      )
    },
    [history],
  )

  // URL sync: ?project=<id> mirrors the currently open document.
  const projectParamRef = useRef(initialProjectId)
  const setProjectParam = useCallback((projectId: string | null) => {
    projectParamRef.current = projectId
    replaceProjectParam(projectId)
  }, [])

  const selected = doc.shapes.find((s) => s.id === selectedId) ?? null

  // --- Persistence ---------------------------------------------------------
  const refreshList = useCallback(async () => {
    try {
      const docs = await listMaskDocs()
      setSavedDocs(projectSwitcherItems(docs, mode))
    } catch {
      // listing failures are non-fatal; the switcher just shows nothing.
    }
  }, [mode])

  // Load the saved-project list once on mount. The setState happens after an
  // await (not synchronously in the effect body), so it does not cascade.
  useEffect(() => {
    let alive = true
    listMaskDocs()
      .then((docs) => {
        if (alive) {
          setSavedDocs(projectSwitcherItems(docs, mode))
        }
      })
      .catch(() => {
        // non-fatal: the switcher just shows nothing
      })
    return () => {
      alive = false
    }
  }, [mode])

  // Refresh the saved-project list when data is imported / cleared elsewhere
  // (e.g. the system menu), so the switcher reflects it without a reload.
  useEffect(() => onDataChange(() => void refreshList()), [refreshList])

  const persist = useCallback(
    async (d: MaskDocument) => {
      // Don't create empty projects: skip a doc with no shapes that was never
      // saved (e.g. a fresh tab). Once it has content (or already exists), keep
      // saving — so emptying a real project still persists.
      const alreadySaved = savedDocs.some((s) => s.id === d.id)
      if (d.shapes.length === 0 && !alreadySaved) return
      await saveMaskDoc(d)
      if (projectParamRef.current !== d.id) void setProjectParam(d.id)
      await refreshList()
    },
    [refreshList, savedDocs, setProjectParam],
  )

  const { status } = useAutosave(doc, persist)

  // --- Shape mutations -----------------------------------------------------
  const addShape = useCallback(
    (shape: Shape) => {
      history.set((d) => ({ ...d, shapes: [...d.shapes, shape] }))
      setSelectedId(shape.id)
    },
    [history],
  )

  // Live edits (dragging) are coalesced into one undo step — see `onBeginEdit`
  // (history.snapshot) on the canvas — so they don't push per-frame.
  const updateShape = useCallback(
    (id: string, patch: Partial<Shape>) => {
      history.set(
        (d) => ({
          ...d,
          shapes: d.shapes.map((s) =>
            s.id === id ? ({ ...s, ...patch } as Shape) : s,
          ),
        }),
        { history: false },
      )
    },
    [history],
  )

  const deleteShape = useCallback(
    (id: string) => {
      history.set((d) => ({
        ...d,
        shapes: d.shapes.filter((s) => s.id !== id),
      }))
      setSelectedId((cur) => (cur === id ? null : cur))
    },
    [history],
  )

  const setPolarity = useCallback(
    (polarity: Polarity) => {
      history.set((d) => ({ ...d, polarity }))
    },
    [history],
  )

  // Duplicate the selected shape, offset slightly, and select the copy.
  const duplicateSelected = useCallback(() => {
    if (!selectedId) return
    const src = doc.shapes.find((s) => s.id === selectedId)
    if (!src) return
    const copy = {
      ...src,
      id: newId(`${src.kind}-`),
      x: src.x + 8,
      y: src.y + 8,
    } as Shape
    history.set((d) => ({ ...d, shapes: [...d.shapes, copy] }))
    setSelectedId(copy.id)
  }, [doc.shapes, selectedId, history])

  // --- Clipboard (copy / cut / paste) --------------------------------------
  // In-app clipboard holding a detached copy of a shape (no id).
  const clipboardRef = useRef<Shape | null>(null)

  const copySelected = useCallback((): boolean => {
    if (!selectedId) return false
    const src = doc.shapes.find((s) => s.id === selectedId)
    if (!src) return false
    clipboardRef.current = { ...src }
    return true
  }, [doc.shapes, selectedId])

  const pasteClipboard = useCallback(() => {
    const src = clipboardRef.current
    if (!src) return
    // Offset the paste and keep it inside the field.
    const nx = clamp(src.x + 8, 0, doc.widthUm)
    const ny = clamp(src.y + 8, 0, doc.heightUm)
    const copy = { ...src, id: newId(`${src.kind}-`), x: nx, y: ny } as Shape
    history.set((d) => ({ ...d, shapes: [...d.shapes, copy] }))
    setSelectedId(copy.id)
    // Cascade subsequent pastes from the new position.
    clipboardRef.current = { ...src, x: nx, y: ny }
  }, [doc.widthUm, doc.heightUm, history])

  const cutSelected = useCallback(() => {
    if (copySelected() && selectedId) deleteShape(selectedId)
  }, [copySelected, deleteShape, selectedId])

  // --- Project actions -----------------------------------------------------
  // Renaming on every keystroke shouldn't flood undo, so it's not recorded.
  const handleRename = useCallback(
    (name: string) => {
      history.set((d) => ({ ...d, name }), { history: false })
    },
    [history],
  )

  // Apply a loaded document to local state. Shared by handleSelect (user click)
  // and the URL → state hydration effect. Caller logs/sets the URL param.
  const applyLoadedDoc = useCallback((loaded: Awaited<ReturnType<typeof loadMaskDoc>>) => {
    if (!loaded) return
    if (!matchesMode(loaded, mode)) return
    const heightUm = mode === 'bmp' ? loaded.widthUm * (dmd.h / dmd.w) : loaded.heightUm
    // Drop persistence metadata (updatedAt) — keep only MaskDocument fields.
    const next: MaskDocument = {
      id: loaded.id,
      name: loaded.name,
      widthUm: loaded.widthUm,
      heightUm,
      magnification: loaded.magnification,
      umPerCm: loaded.umPerCm,
      target: loaded.target,
      shapes: loaded.shapes,
      polarity: loaded.polarity,
    }
    history.reset(next)
    setSelectedId(null)
    setTool('select')
    return next
  }, [history, mode, dmd.h, dmd.w])

  const handleSelect = useCallback(
    async (id: string) => {
      const loaded = await loadMaskDoc(id)
      if (!loaded || !matchesMode(loaded, mode)) {
        toast.error(t('mask.loadFailed'))
        return
      }
      const next = applyLoadedDoc(loaded)
      if (next) {
        void setProjectParam(next.id)
        logEvent(t('mask.loaded', { name: next.name }))
      }
    },
    [applyLoadedDoc, mode, setProjectParam, t],
  )

  const handleCreateNew = useCallback(() => {
    const cal0 = defaultCalibration()
    const fresh = createModeDocument(mode, locale)
    setDmd({ w: cal0.dmdW, h: cal0.dmdH })
    history.reset(fresh)
    setSelectedId(null)
    setTool('select')
    // Clear the URL param; autosave + the state→URL effect will set it once the
    // fresh doc is persisted and appears in the saved list.
    void setProjectParam(null)
    logEvent(t('mask.created'))
  }, [history, locale, mode, setProjectParam, t])

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteMaskDoc(id)
      await refreshList()
      if (id === doc.id) {
        handleCreateNew()
      }
      logEvent(t('mask.deleted'))
    },
    [doc.id, handleCreateNew, refreshList, t],
  )

  // --- URL ⇄ state ---------------------------------------------------------
  // Resume ONCE on mount from an explicit ?project URL.
  const hydrateInitialProject = useEffectEvent(
    async (target: string, isAlive: () => boolean) => {
      if (target === doc.id || !isAlive()) return
      try {
        const loaded = await loadMaskDoc(target)
        if (isAlive()) {
          const next = applyLoadedDoc(loaded)
          if (next) {
            void setProjectParam(next.id)
            logEvent(t('mask.loaded', { name: next.name }))
          } else if (projectParamRef.current) {
            void setProjectParam(null)
          }
        }
      } catch {
        // Load failures are non-fatal; keep the current document.
      }
    },
  )

  useEffect(() => {
    let alive = true
    const target = projectParamRef.current
    if (target) void hydrateInitialProject(target, () => alive)
    return () => {
      alive = false
    }
  }, [])

  // --- File I/O ------------------------------------------------------------
  const handleImportMaskFile = useCallback(
    async (files: File[]) => {
      const file = files[0]
      if (!file) return

      setImportingMask(true)
      try {
        const imported = await importMaskFile(file, cal)
        if (imported.shapes.length === 0) throw new Error(t('mask.importFailed'))

        history.set((d) => ({ ...d, shapes: [...d.shapes, ...imported.shapes] }))
        setSelectedId(imported.shapes[imported.shapes.length - 1]?.id ?? null)
        setTool('select')
        logEvent(
          t('mask.importedFromFile', {
            format: imported.format,
            name: file.name,
          }),
        )
        toast.success(
          imported.skipped > 0
            ? t('mask.importedSkipped', { count: imported.skipped })
            : t('mask.imported'),
        )
      } catch (error) {
        const message =
          error instanceof Error ? error.message : t('mask.importFailed')
        toast.error(message)
      } finally {
        setImportingMask(false)
      }
    },
    [cal, history, t],
  )

  const handleExportBmp = useCallback(() => {
    const base = doc.name.trim() || 'mask'
    downloadBmp(doc, cal, `${base}.bmp`)
    logEvent(t('mask.exportedBmp', { file: `${base}.bmp` }))
  }, [doc, cal, t])

  const handleExportGds = useCallback(() => {
    const base = doc.name.trim() || 'mask'
    downloadGds(doc, cal, `${base}.gds`)
    logEvent(t('mask.exportedGds', { file: `${base}.gds` }))
  }, [doc, cal, t])

  // --- Keyboard shortcuts --------------------------------------------------
  const handleGlobalKeyDown = useEffectEvent((e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      const typing =
        !!el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.isContentEditable)
      const mod = e.metaKey || e.ctrlKey

      // Undo / redo (Cmd/Ctrl+Z, Shift for redo; Ctrl+Y also redoes).
      if (mod && (e.key === 'z' || e.key === 'Z')) {
        if (typing) return
        e.preventDefault()
        if (e.shiftKey) history.redo()
        else history.undo()
        return
      }
      if (mod && (e.key === 'y' || e.key === 'Y')) {
        if (typing) return
        e.preventDefault()
        history.redo()
        return
      }

      // Clipboard (Cmd/Ctrl + C/X/V/D). Only consume the event when we actually
      // act, so plain text copy still works when no shape is involved.
      if (mod && !e.shiftKey && !e.altKey) {
        if (typing) return
        switch (e.key.toLowerCase()) {
          case 'c':
            if (selectedId) {
              e.preventDefault()
              copySelected()
            }
            return
          case 'x':
            if (selectedId) {
              e.preventDefault()
              cutSelected()
            }
            return
          case 'v':
            if (clipboardRef.current) {
              e.preventDefault()
              pasteClipboard()
            }
            return
          case 'd':
            if (selectedId) {
              e.preventDefault()
              duplicateSelected()
            }
            return
        }
      }

      // Single-key commands (ignored while typing or with modifiers held).
      if (typing || mod || e.altKey) return
      switch (e.key.toLowerCase()) {
        case 'd':
          if (selectedId) {
            e.preventDefault()
            duplicateSelected()
          }
          break
        case 'v':
          setTool('select')
          break
        case 'r':
          setTool('rect')
          break
        case 'o':
          setTool('ellipse')
          break
        case 'l':
          setTool('line')
          break
        case 't':
          setTool('text')
          break
        case 's':
          setTool('lineSpace')
          break
        case 'g':
          setTool('grid')
          break
        case 'escape':
          setSelectedId(null)
          break
      }
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => handleGlobalKeyDown(e)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const onAction = (event: Event) => {
      const detail = (event as CustomEvent<WebMcpActionRequest>).detail
      if (!detail?.type.startsWith('mask.')) return
      detail.handled = true

      void (async () => {
        const params = isRecord(detail.payload) ? detail.payload : {}
        const saveNext = async (next: MaskDocument) => {
          await saveMaskDoc(next)
          await refreshList()
          return summarizeMaskDocument(next)
        }

        switch (detail.type) {
          case 'mask.get_state': {
            detail.resolve({
              handled: true,
              document: summarizeMaskDocument(doc),
              calibration: cal,
              selectedId,
              tool,
            })
            return
          }

          case 'mask.create_project': {
            const cal0 = defaultCalibration()
            const fresh = createModeDocument(mode, locale)
            if (typeof params.name === 'string' && params.name.trim()) {
              fresh.name = params.name.trim()
            }
            setDmd({ w: cal0.dmdW, h: cal0.dmdH })
            history.reset(fresh)
            setSelectedId(null)
            setTool('select')
            void setProjectParam(fresh.id)
            detail.resolve({
              handled: true,
              created: true,
              document: await saveNext(fresh),
            })
            return
          }

          case 'mask.rename_project': {
            const name =
              typeof params.name === 'string' && params.name.trim()
                ? params.name.trim()
                : null
            if (!name) throw new Error('name must be a non-empty string')
            const next = { ...doc, name }
            history.set(() => next, { history: false })
            detail.resolve({
              handled: true,
              renamed: true,
              document: await saveNext(next),
            })
            return
          }

          case 'mask.delete_project': {
            const projectId =
              typeof params.projectId === 'string' && params.projectId.trim()
                ? params.projectId.trim()
                : doc.id
            await deleteMaskDoc(projectId)
            await refreshList()
            if (projectId === doc.id) handleCreateNew()
            detail.resolve({ handled: true, deleted: true, projectId })
            return
          }

          case 'mask.import_file_base64': {
            const base64 =
              typeof params.base64 === 'string' && params.base64.trim()
                ? params.base64.trim()
                : null
            const fileName =
              typeof params.fileName === 'string' && params.fileName.trim()
                ? params.fileName.trim()
                : 'mask.bmp'
            const mimeType =
              typeof params.mimeType === 'string'
                ? params.mimeType
                : 'application/octet-stream'
            if (!base64) throw new Error('base64 must be a non-empty string')
            const file = fileFromBase64(base64, fileName, mimeType)
            const imported = await importMaskFile(file, cal)
            if (imported.shapes.length === 0) throw new Error(t('mask.importFailed'))
            const next = { ...doc, shapes: [...doc.shapes, ...imported.shapes] }
            history.set(() => next)
            setSelectedId(imported.shapes[imported.shapes.length - 1]?.id ?? null)
            setTool('select')
            detail.resolve({
              handled: true,
              imported: true,
              format: imported.format,
              skipped: imported.skipped,
              shapeCount: imported.shapes.length,
              document: await saveNext(next),
            })
            return
          }

          case 'mask.set_polarity': {
            const rawPolarity = params.polarity
            if (rawPolarity !== 'darkOnLight' && rawPolarity !== 'lightOnDark') {
              throw new Error('polarity must be darkOnLight or lightOnDark')
            }
            const polarity: Polarity = rawPolarity
            const next = { ...doc, polarity }
            history.set(() => next)
            detail.resolve({
              handled: true,
              updated: true,
              document: await saveNext(next),
            })
            return
          }

          case 'mask.set_calibration': {
            if (!isBmp) {
              throw new Error('BMP calibration is not available on the GDS layout page')
            }
            const nextDmd = {
              w: Math.round(finiteNumber(params.dmdW) ?? dmd.w),
              h: Math.round(finiteNumber(params.dmdH) ?? dmd.h),
            }
            if (!(nextDmd.w > 0) || !(nextDmd.h > 0)) {
              throw new Error('dmdW and dmdH must be positive numbers')
            }

            let magnification = doc.magnification
            let umPerCm = doc.umPerCm
            const requestedMagnification = finiteNumber(params.magnification)
            const requestedUmPerCm = finiteNumber(params.umPerCm)
            if (requestedMagnification !== null) {
              if (!(requestedMagnification > 0)) {
                throw new Error('magnification must be positive')
              }
              const constant = umPerCm * magnification
              magnification = requestedMagnification
              umPerCm = constant / magnification
            }
            if (requestedUmPerCm !== null) {
              if (!(requestedUmPerCm > 0)) throw new Error('umPerCm must be positive')
              umPerCm = requestedUmPerCm
            }

            const requestedWidthUm = finiteNumber(params.widthUm)
            const widthUm = requestedWidthUm !== null ? requestedWidthUm : substrateWidthUm(umPerCm)
            const heightUm = widthUm * (nextDmd.h / nextDmd.w)
            if (!(widthUm > 0) || !(heightUm > 0)) {
              throw new Error('widthUm must be a positive number')
            }
            const next: MaskDocument = {
              ...doc,
              target: 'bmp',
              magnification,
              umPerCm,
              widthUm,
              heightUm,
            }
            setDmd(nextDmd)
            history.set(() => next, { history: false })
            detail.resolve({
              handled: true,
              updated: true,
              dmd: nextDmd,
              document: await saveNext(next),
            })
            return
          }

          case 'mask.add_shape': {
            const shape = parseIncomingShape(params.shape ?? params)
            const next = { ...doc, shapes: [...doc.shapes, shape] }
            history.set(() => next)
            setSelectedId(shape.id)
            detail.resolve({
              handled: true,
              added: true,
              shape,
              document: await saveNext(next),
            })
            return
          }

          case 'mask.update_shape': {
            const shapeId =
              typeof params.shapeId === 'string' ? params.shapeId : selectedId
            if (!shapeId) throw new Error('shapeId is required')
            if (!isRecord(params.patch)) throw new Error('patch must be an object')
            const current = doc.shapes.find((shape) => shape.id === shapeId)
            if (!current) throw new Error('shape not found')
            const merged = parseIncomingShape({ ...current, ...params.patch, id: shapeId })
            const next = {
              ...doc,
              shapes: doc.shapes.map((shape) =>
                shape.id === shapeId ? merged : shape,
              ),
            }
            history.set(() => next)
            setSelectedId(shapeId)
            detail.resolve({
              handled: true,
              updated: true,
              shape: merged,
              document: await saveNext(next),
            })
            return
          }

          case 'mask.delete_shape': {
            const shapeId =
              typeof params.shapeId === 'string' ? params.shapeId : selectedId
            if (!shapeId) throw new Error('shapeId is required')
            const next = {
              ...doc,
              shapes: doc.shapes.filter((shape) => shape.id !== shapeId),
            }
            history.set(() => next)
            setSelectedId((cur) => (cur === shapeId ? null : cur))
            detail.resolve({
              handled: true,
              deleted: true,
              shapeId,
              document: await saveNext(next),
            })
            return
          }

          case 'mask.duplicate_shape': {
            const shapeId =
              typeof params.shapeId === 'string' ? params.shapeId : selectedId
            if (!shapeId) throw new Error('shapeId is required')
            const src = doc.shapes.find((shape) => shape.id === shapeId)
            if (!src) throw new Error('shape not found')
            const copy = {
              ...src,
              id: newId(`${src.kind}-`),
              x: src.x + 8,
              y: src.y + 8,
            } as Shape
            const next = { ...doc, shapes: [...doc.shapes, copy] }
            history.set(() => next)
            setSelectedId(copy.id)
            detail.resolve({
              handled: true,
              duplicated: true,
              shape: copy,
              document: await saveNext(next),
            })
            return
          }

          case 'mask.export_bmp': {
            if (!isBmp) throw new Error('BMP export is not available on the GDS layout page')
            const filename =
              typeof params.filename === 'string' && params.filename.trim()
                ? params.filename.trim()
                : `${doc.name.trim() || 'mask'}.bmp`
            downloadBmp(doc, cal, filename)
            detail.resolve({ handled: true, exported: true, format: 'bmp', filename })
            return
          }

          case 'mask.export_gds': {
            if (isBmp) throw new Error('GDS export is not available on the BMP projection page')
            const filename =
              typeof params.filename === 'string' && params.filename.trim()
                ? params.filename.trim()
                : `${doc.name.trim() || 'mask'}.gds`
            downloadGds(doc, cal, filename)
            detail.resolve({ handled: true, exported: true, format: 'gds', filename })
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
    applyLoadedDoc,
    cal,
    dmd.h,
    dmd.w,
    doc,
    handleCreateNew,
    history,
    isBmp,
    locale,
    mode,
    refreshList,
    selectedId,
    setProjectParam,
    t,
    tool,
  ])

  const panel = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto p-4">
          {/* 1. Project switcher + autosave */}
          <ProjectSwitcher
            items={savedDocs}
            currentId={doc.id}
            currentName={doc.name}
            onRename={handleRename}
            onSelect={handleSelect}
            onCreateNew={handleCreateNew}
            onDelete={handleDelete}
            status={status}
            className="w-full flex-wrap [&_[data-slot=input-group]]:!w-full"
          />

          {/* 2. File import */}
          <div className="flex flex-col gap-2">
            <SectionLabel>{t('mask.fileSection')}</SectionLabel>
            <FileDropzone
              label={isBmp ? t('mask.bmpFileDropLabel') : t('mask.gdsFileDropLabel')}
              hint={isBmp ? t('mask.bmpFileDropHint') : t('mask.gdsFileDropHint')}
              accept={isBmp ? '.bmp,image/bmp' : '.gds'}
              busy={importingMask}
              onFiles={handleImportMaskFile}
            />
          </div>

          {/* 3. Operation / drawing tools */}
          <Toolbar
            tool={tool}
            onToolChange={setTool}
            onZoomFit={() => setViewZoom(1)}
          />

          {/* 4. Context section — tool defaults / shape properties / hint */}
          <div className="flex flex-col gap-3">
            {isDefaultableTool(tool) ? (
              <ToolDefaultsPanel
                tool={tool}
                defaults={toolDefaults}
                onChange={setToolDefaults}
              />
            ) : selected ? (
              <Inspector
                shape={selected}
                onUpdate={updateShape}
                onDelete={deleteShape}
              />
            ) : (
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t('mask.hint')}
              </p>
            )}
          </div>

          {/* 5. Calibration — collapsed by default */}
          <Accordion>
            <AccordionItem value="cal" className="border-t border-border">
              <AccordionTrigger variant="section">
                {t('mask.calibration')}
              </AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col gap-5">
                  <PolarityToggle
                    polarity={doc.polarity}
                    onPolarityChange={setPolarity}
                  />
                  {isBmp ? (
                    <CalibrationPanel
                      cal={cal}
                      onMagnification={handleMagnification}
                      onUmPerCm={handleUmPerCm}
                      onDmd={handleDmdChange}
                    />
                  ) : (
                    <GdsChipPanel
                      widthUm={doc.widthUm}
                      heightUm={doc.heightUm}
                      onLayoutSize={handleLayoutSize}
                    />
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

        </div>

      {/* 6. Export */}
      <div className="flex flex-col gap-2 border-t border-border p-4">
        <SectionLabel>{t('mask.export')}</SectionLabel>
        <div className="grid grid-cols-1 gap-2">
          {isBmp ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportBmp}
              title={t('mask.bmpTitle')}
            >
              <FileImage />
              BMP
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportGds}
              title={t('mask.gdsTitle')}
            >
              <FileDown />
              GDS
            </Button>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <ToolLayout
      panel={panel}
      panelTitle={isBmp ? t('mask.panelTitle') : t('mask.gdsPanelTitle')}
      panelWidth={300}
    >
      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-4">
        <MaskCanvas
          doc={doc}
          cal={cal}
          tool={tool}
          defaults={toolDefaults}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onAdd={addShape}
          onUpdate={updateShape}
          onDelete={deleteShape}
          onToolChange={setTool}
          onViewZoom={handleViewZoomTool}
          viewZoom={viewZoom}
          onBeginEdit={history.snapshot}
        />
      </section>
    </ToolLayout>
  )
}

export function MaskToolPage(props: MaskToolPageProps) {
  return useMaskToolPageView(props)
}

export default MaskToolPage
