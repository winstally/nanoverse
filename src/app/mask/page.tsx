'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useQueryState } from 'nuqs'
import { Download } from 'lucide-react'
import { Calibration, defaultCalibration } from '@/modules/mask/calibration'
import {
  createDefaultDocument,
  MaskDocument,
  Polarity,
} from '@/modules/mask/document'
import { Shape, newId } from '@/modules/mask/shape'
import { downloadBmp } from '@/modules/mask/renderer'
import { Toolbar, ToolKind } from '@/modules/mask/components/Toolbar'
import { MaskCanvas } from '@/modules/mask/components/MaskCanvas'
import { Inspector } from '@/modules/mask/components/Inspector'
import { ToolDefaultsPanel } from '@/modules/mask/components/ToolDefaultsPanel'
import {
  DEFAULT_TOOL_DEFAULTS,
  isDefaultableTool,
  ToolDefaults,
} from '@/modules/mask/tool-defaults'
import { CalibrationPanel } from '@/modules/mask/components/CalibrationPanel'
import { PolarityToggle } from '@/modules/mask/components/PolarityToggle'
import { GeneratorPanel } from '@/modules/mask/components/GeneratorPanel'
import { Button } from '@/components/ui/button'
import { SectionLabel } from '@/components/app/SectionLabel'
import { ToolLayout } from '@/components/app/ToolLayout'
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
} from '@/lib/storage'
import { logEvent } from '@/lib/log'
import { toast } from 'sonner'

const initialCal = defaultCalibration()

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi)
}

function MaskTool() {
  const [cal, setCal] = useState<Calibration>(initialCal)
  const history = useHistory<MaskDocument>(createDefaultDocument(initialCal))
  const doc = history.state
  const [tool, setTool] = useState<ToolKind>('select')
  const [toolDefaults, setToolDefaults] = useState<ToolDefaults>(DEFAULT_TOOL_DEFAULTS)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [savedDocs, setSavedDocs] = useState<ProjectSwitcherItem[]>([])

  // URL sync: ?project=<id> mirrors the currently open document.
  const [projectParam, setProjectParam] = useQueryState('project')

  const selected = doc.shapes.find((s) => s.id === selectedId) ?? null

  // --- Persistence ---------------------------------------------------------
  const refreshList = useCallback(async () => {
    try {
      const docs = await listMaskDocs()
      setSavedDocs(docs.map((d) => ({ id: d.id, name: d.name })))
    } catch {
      // listing failures are non-fatal; the switcher just shows nothing.
    }
  }, [])

  // Load the saved-project list once on mount. The setState happens after an
  // await (not synchronously in the effect body), so it does not cascade.
  useEffect(() => {
    let alive = true
    listMaskDocs()
      .then((docs) => {
        if (alive) setSavedDocs(docs.map((d) => ({ id: d.id, name: d.name })))
      })
      .catch(() => {
        // non-fatal: the switcher just shows nothing
      })
    return () => {
      alive = false
    }
  }, [])

  const persist = useCallback(
    async (d: MaskDocument) => {
      await saveMaskDoc(d)
      await refreshList()
    },
    [refreshList],
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
    // Width is the magnification anchor; re-derive the field height from the DMD
    // aspect so pixels are square. This also normalises legacy masks that were
    // saved with an independent (anisotropic) height.
    const pitch = loaded.widthUm / cal.dmdW
    const heightUm = cal.dmdH * pitch
    // Drop persistence metadata (updatedAt) — keep only MaskDocument fields.
    const next: MaskDocument = {
      id: loaded.id,
      name: loaded.name,
      widthUm: loaded.widthUm,
      heightUm,
      shapes: loaded.shapes,
      polarity: loaded.polarity,
    }
    history.reset(next)
    setCal((c) => ({
      ...c,
      substrateWUm: next.widthUm,
      substrateHUm: next.heightUm,
    }))
    setSelectedId(null)
    setTool('select')
    return next
  }, [history, cal.dmdW, cal.dmdH])

  const handleSelect = useCallback(
    async (id: string) => {
      const loaded = await loadMaskDoc(id)
      if (!loaded) {
        toast.error('プロジェクトを読み込めませんでした')
        return
      }
      const next = applyLoadedDoc(loaded)
      if (next) {
        void setProjectParam(next.id)
        logEvent(`マスク「${next.name}」を読み込みました`)
      }
    },
    [applyLoadedDoc, setProjectParam],
  )

  const handleCreateNew = useCallback(() => {
    const fresh = createDefaultDocument(defaultCalibration())
    history.reset(fresh)
    setCal(defaultCalibration())
    setSelectedId(null)
    setTool('select')
    // Clear the URL param; autosave + the state→URL effect will set it once the
    // fresh doc is persisted and appears in the saved list.
    void setProjectParam(null)
    logEvent('新規マスクを作成しました')
  }, [history, setProjectParam])

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteMaskDoc(id)
      await refreshList()
      if (id === doc.id) {
        handleCreateNew()
      }
      logEvent('マスクを削除しました')
    },
    [doc.id, handleCreateNew, refreshList],
  )

  // --- URL ⇄ state ---------------------------------------------------------
  // URL → state (ONCE on mount): if ?project points at a stored doc that isn't
  // the current one, load it asynchronously. The setState happens inside the
  // .then callback (not the effect body), so it does not cascade.
  const hydratedFromUrl = useRef(false)
  useEffect(() => {
    if (hydratedFromUrl.current) return
    hydratedFromUrl.current = true
    if (!projectParam || projectParam === doc.id) return
    const target = projectParam
    loadMaskDoc(target)
      .then((loaded) => {
        if (loaded) {
          applyLoadedDoc(loaded)
          logEvent(`マスク「${loaded.name}」を読み込みました`)
        } else {
          // Unknown id — drop the stale param, keep the current new doc.
          void setProjectParam(null)
        }
      })
      .catch(() => {
        // Load failures are non-fatal; keep the current document.
      })
  }, [projectParam, doc.id, applyLoadedDoc, setProjectParam])

  // state → URL: once the current doc is persisted (present in the saved list),
  // reflect its id in the URL. Equality guard keeps this loop-free. Updating the
  // URL (an external system) from an effect is allowed.
  useEffect(() => {
    const persisted = savedDocs.some((d) => d.id === doc.id)
    if (persisted && projectParam !== doc.id) {
      void setProjectParam(doc.id)
    }
  }, [savedDocs, doc.id, projectParam, setProjectParam])

  // --- Export --------------------------------------------------------------
  const handleExport = useCallback(() => {
    const base = doc.name.trim() || 'mask'
    downloadBmp(doc, cal, `${base}.bmp`)
    logEvent(`BMP を出力しました: ${base}.bmp`)
  }, [doc, cal])

  // --- Keyboard shortcuts --------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    history,
    selectedId,
    duplicateSelected,
    copySelected,
    cutSelected,
    pasteClipboard,
  ])

  const isGenerator = tool === 'lineSpace' || tool === 'grid'

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

          {/* 2. Tools */}
          <div className="flex flex-col gap-2">
            <SectionLabel>ツール</SectionLabel>
            <Toolbar tool={tool} onToolChange={setTool} />
            <PolarityToggle
              polarity={doc.polarity}
              onPolarityChange={setPolarity}
            />
          </div>

          {/* 3. Context section — generator form / shape properties / hint */}
          <div className="flex flex-col gap-3">
            {isGenerator ? (
              <GeneratorPanel kind={tool} onAdd={addShape} />
            ) : isDefaultableTool(tool) ? (
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
                ツールで図形を描くか、図形を選択すると µm 単位で編集できます。
              </p>
            )}
          </div>

          {/* 4. Calibration — collapsed by default */}
          <Accordion>
            <AccordionItem value="cal" className="border-t border-border">
              <AccordionTrigger variant="section">
                キャリブレーション
              </AccordionTrigger>
              <AccordionContent>
                <CalibrationPanel cal={cal} onCalChange={setCal} />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

      {/* 5. Export */}
      <div className="border-t border-border p-4">
        <Button onClick={handleExport} className="w-full">
          <Download />
          BMP出力
        </Button>
      </div>
    </div>
  )

  return (
    <ToolLayout panel={panel} panelTitle="マスク設定" panelWidth={300}>
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
          onBeginEdit={history.snapshot}
        />
      </section>
    </ToolLayout>
  )
}

// `MaskTool` consumes the URL search params via nuqs' `useQueryState`, which
// relies on `useSearchParams()`. Next.js requires that consumer to sit under a
// <Suspense> boundary so the rest of the route can still be prerendered.
export default function MaskPage() {
  return (
    <Suspense fallback={null}>
      <MaskTool />
    </Suspense>
  )
}
