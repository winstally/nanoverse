'use client'

import { useCallback, useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { Calibration, defaultCalibration } from '@/modules/mask/calibration'
import {
  createDefaultDocument,
  MaskDocument,
  Polarity,
} from '@/modules/mask/document'
import { Shape } from '@/modules/mask/shape'
import { downloadBmp } from '@/modules/mask/renderer'
import { Toolbar, ToolKind } from '@/modules/mask/components/Toolbar'
import { MaskCanvas } from '@/modules/mask/components/MaskCanvas'
import { Inspector } from '@/modules/mask/components/Inspector'
import { CalibrationPanel } from '@/modules/mask/components/CalibrationPanel'
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
import {
  deleteMaskDoc,
  listMaskDocs,
  loadMaskDoc,
  saveMaskDoc,
} from '@/lib/storage'
import { logEvent } from '@/lib/log'
import { toast } from 'sonner'

const initialCal = defaultCalibration()

export default function MaskPage() {
  const [cal, setCal] = useState<Calibration>(initialCal)
  const [doc, setDoc] = useState<MaskDocument>(() =>
    createDefaultDocument(initialCal),
  )
  const [tool, setTool] = useState<ToolKind>('select')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [savedDocs, setSavedDocs] = useState<ProjectSwitcherItem[]>([])

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
  const addShape = useCallback((shape: Shape) => {
    setDoc((d) => ({ ...d, shapes: [...d.shapes, shape] }))
    setSelectedId(shape.id)
  }, [])

  const updateShape = useCallback((id: string, patch: Partial<Shape>) => {
    setDoc((d) => ({
      ...d,
      shapes: d.shapes.map((s) =>
        s.id === id ? ({ ...s, ...patch } as Shape) : s,
      ),
    }))
  }, [])

  const deleteShape = useCallback((id: string) => {
    setDoc((d) => ({ ...d, shapes: d.shapes.filter((s) => s.id !== id) }))
    setSelectedId((cur) => (cur === id ? null : cur))
  }, [])

  const setPolarity = useCallback((polarity: Polarity) => {
    setDoc((d) => ({ ...d, polarity }))
  }, [])

  // --- Project actions -----------------------------------------------------
  const handleRename = useCallback((name: string) => {
    setDoc((d) => ({ ...d, name }))
  }, [])

  const handleSelect = useCallback(
    async (id: string) => {
      const loaded = await loadMaskDoc(id)
      if (!loaded) {
        toast.error('プロジェクトを読み込めませんでした')
        return
      }
      // Drop persistence metadata (updatedAt) — keep only MaskDocument fields.
      const next: MaskDocument = {
        id: loaded.id,
        name: loaded.name,
        widthUm: loaded.widthUm,
        heightUm: loaded.heightUm,
        shapes: loaded.shapes,
        polarity: loaded.polarity,
      }
      setDoc(next)
      setCal((c) => ({
        ...c,
        substrateWUm: next.widthUm,
        substrateHUm: next.heightUm,
      }))
      setSelectedId(null)
      setTool('select')
      logEvent(`マスク「${next.name}」を読み込みました`)
    },
    [],
  )

  const handleCreateNew = useCallback(() => {
    const fresh = createDefaultDocument(defaultCalibration())
    setDoc(fresh)
    setCal(defaultCalibration())
    setSelectedId(null)
    setTool('select')
    logEvent('新規マスクを作成しました')
  }, [])

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

  // --- Export --------------------------------------------------------------
  const handleExport = useCallback(() => {
    const base = doc.name.trim() || 'mask'
    downloadBmp(doc, cal, `${base}.bmp`)
    logEvent(`BMP を出力しました: ${base}.bmp`)
  }, [doc, cal])

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
          </div>

          {/* 3. Context section — generator form / shape properties / hint */}
          <div className="flex flex-col gap-3">
            {isGenerator ? (
              <GeneratorPanel kind={tool} onAdd={addShape} />
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
          <Accordion className="border-t border-border pt-1">
            <AccordionItem value="cal" className="border-b-0">
              <AccordionTrigger className="eyebrow !text-muted-foreground hover:no-underline">
                キャリブレーション
              </AccordionTrigger>
              <AccordionContent>
                <CalibrationPanel
                  cal={cal}
                  onCalChange={setCal}
                  polarity={doc.polarity}
                  onPolarityChange={setPolarity}
                />
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
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          図形 <span className="tnum">{doc.shapes.length}</span> 個 /{' '}
          <span className="tnum">{Math.round(doc.widthUm)}</span>×
          <span className="tnum">{Math.round(doc.heightUm)}</span> µm
        </p>
      </div>
    </div>
  )

  return (
    <ToolLayout panel={panel} panelTitle="マスク設定" panelWidth={300}>
      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-muted/30 p-4">
        <MaskCanvas
          doc={doc}
          cal={cal}
          tool={tool}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onAdd={addShape}
          onUpdate={updateShape}
          onDelete={deleteShape}
          onToolChange={setTool}
        />
      </section>
    </ToolLayout>
  )
}
