'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Calibration } from '@/modules/mask/calibration'
import { MaskDocument } from '@/modules/mask/document'
import {
  EllipseShape,
  LineSpaceShape,
  newId,
  RectShape,
  Shape,
  TextShape,
} from '@/modules/mask/shape'
import { renderToCanvas } from '@/modules/mask/renderer'
import { Ruler, RULER_SIZE } from '@/modules/mask/components/Ruler'
import { ToolKind } from '@/modules/mask/components/Toolbar'

type HandleId = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w'

interface Box {
  x: number
  y: number
  w: number
  h: number
}

interface DragState {
  mode: 'create' | 'move' | 'resize'
  shapeId: string | null
  handle?: HandleId
  /** pointer start in µm */
  startUmX: number
  startUmY: number
  /** original box of the shape in µm */
  origin: Box
}

const HANDLE_PX = 8
const MIN_UM = 0.5
/** Selection-chrome accent (mirrors --color-accent). Not part of the mask artifact. */
const ACCENT = '#2f6df0'

interface MaskCanvasProps {
  doc: MaskDocument
  cal: Calibration
  tool: ToolKind
  selectedId: string | null
  onSelect: (id: string | null) => void
  onAdd: (shape: Shape) => void
  onUpdate: (id: string, patch: Partial<Shape>) => void
  onDelete: (id: string) => void
  onToolChange: (tool: ToolKind) => void
}

/** Bounding box of a shape, in µm. */
function boundsOf(shape: Shape): Box {
  switch (shape.kind) {
    case 'rect':
    case 'ellipse':
      return { x: shape.x, y: shape.y, w: shape.w, h: shape.h }
    case 'text': {
      // approximate: width ~ 0.6 * height per char
      const w = Math.max(shape.text.length, 1) * shape.heightUm * 0.6
      return { x: shape.x, y: shape.y, w, h: shape.heightUm }
    }
    case 'lineSpace': {
      const pitch = shape.lineWidthUm + shape.spaceUm
      const span = shape.count * pitch - shape.spaceUm
      if (shape.orientation === 'vertical') {
        return { x: shape.x, y: shape.y, w: Math.max(span, MIN_UM), h: shape.lengthUm }
      }
      return { x: shape.x, y: shape.y, w: shape.lengthUm, h: Math.max(span, MIN_UM) }
    }
    case 'grid': {
      const pitch = shape.lineWidthUm + shape.spaceUm
      const w = (shape.cols - 1) * pitch + shape.lineWidthUm
      const h = (shape.rows - 1) * pitch + shape.lineWidthUm
      return {
        x: shape.x,
        y: shape.y,
        w: Math.max(w, MIN_UM),
        h: Math.max(h, MIN_UM),
      }
    }
  }
}

function patchFromBox(shape: Shape, box: Box): Partial<Shape> {
  switch (shape.kind) {
    case 'rect':
    case 'ellipse':
      return { x: box.x, y: box.y, w: box.w, h: box.h }
    case 'text':
      return { x: box.x, y: box.y }
    case 'lineSpace':
      if (shape.orientation === 'vertical') {
        return { x: box.x, y: box.y, lengthUm: Math.max(box.h, MIN_UM) }
      }
      return { x: box.x, y: box.y, lengthUm: Math.max(box.w, MIN_UM) }
    case 'grid':
      return { x: box.x, y: box.y }
  }
}

export function MaskCanvas({
  doc,
  cal,
  tool,
  selectedId,
  onSelect,
  onAdd,
  onUpdate,
  onDelete,
  onToolChange,
}: MaskCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const offscreenRef = useRef<HTMLCanvasElement | null>(null)
  const [viewport, setViewport] = useState({ w: 0, h: 0 })
  const [preview, setPreview] = useState<Box | null>(null)
  const dragRef = useRef<DragState | null>(null)

  // µm dimensions per document pixel of the DMD = umPerPx; total µm span of canvas.
  const lengthUmX = doc.widthUm
  const lengthUmY = doc.heightUm

  // Compute fit scale (screen px per µm), preserving the substrate aspect ratio.
  const scale = useMemo(() => {
    const availW = Math.max(viewport.w - RULER_SIZE, 1)
    const availH = Math.max(viewport.h - RULER_SIZE, 1)
    if (lengthUmX <= 0 || lengthUmY <= 0) return 1
    return Math.min(availW / lengthUmX, availH / lengthUmY)
  }, [viewport, lengthUmX, lengthUmY])

  const pxW = lengthUmX * scale
  const pxH = lengthUmY * scale

  // Measure available space.
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect
      setViewport({ w: r.width, h: r.height })
    })
    ro.observe(el)
    setViewport({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  // Render document to display canvas (scaled to fit).
  useEffect(() => {
    const display = canvasRef.current
    if (!display || pxW < 1 || pxH < 1) return

    if (!offscreenRef.current) {
      offscreenRef.current = document.createElement('canvas')
    }
    const off = offscreenRef.current
    renderToCanvas(doc, cal, off)

    const dpr = window.devicePixelRatio || 1
    display.width = Math.round(pxW * dpr)
    display.height = Math.round(pxH * dpr)
    display.style.width = `${pxW}px`
    display.style.height = `${pxH}px`

    const ctx = display.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, pxW, pxH)
    ctx.drawImage(off, 0, 0, off.width, off.height, 0, 0, pxW, pxH)

    // border around substrate (chrome, not artifact)
    ctx.strokeStyle = 'rgba(20, 23, 28, 0.2)'
    ctx.lineWidth = 1
    ctx.strokeRect(0.5, 0.5, pxW - 1, pxH - 1)
  }, [doc, cal, pxW, pxH])

  // --- pointer <-> µm helpers ---
  const pointerToUm = useCallback(
    (e: React.PointerEvent | PointerEvent): { x: number; y: number } => {
      const display = canvasRef.current
      if (!display) return { x: 0, y: 0 }
      const rect = display.getBoundingClientRect()
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top
      return { x: px / scale, y: py / scale }
    },
    [scale],
  )

  const selected = doc.shapes.find((s) => s.id === selectedId) ?? null
  const selBox = selected ? boundsOf(selected) : null

  // Handle positions (screen px relative to canvas top-left).
  const handles: { id: HandleId; x: number; y: number }[] = useMemo(() => {
    if (!selBox) return []
    const x0 = selBox.x * scale
    const y0 = selBox.y * scale
    const x1 = (selBox.x + selBox.w) * scale
    const y1 = (selBox.y + selBox.h) * scale
    const mx = (x0 + x1) / 2
    const my = (y0 + y1) / 2
    return [
      { id: 'nw', x: x0, y: y0 },
      { id: 'n', x: mx, y: y0 },
      { id: 'ne', x: x1, y: y0 },
      { id: 'e', x: x1, y: my },
      { id: 'se', x: x1, y: y1 },
      { id: 's', x: mx, y: y1 },
      { id: 'sw', x: x0, y: y1 },
      { id: 'w', x: x0, y: my },
    ]
  }, [selBox, scale])

  const hitHandle = useCallback(
    (umX: number, umY: number): HandleId | null => {
      const tolUm = HANDLE_PX / scale
      for (const h of handles) {
        const hx = h.x / scale
        const hy = h.y / scale
        if (Math.abs(umX - hx) <= tolUm && Math.abs(umY - hy) <= tolUm) {
          return h.id
        }
      }
      return null
    },
    [handles, scale],
  )

  const hitShape = useCallback(
    (umX: number, umY: number): Shape | null => {
      // topmost first
      for (let i = doc.shapes.length - 1; i >= 0; i--) {
        const b = boundsOf(doc.shapes[i])
        if (umX >= b.x && umX <= b.x + b.w && umY >= b.y && umY <= b.y + b.h) {
          return doc.shapes[i]
        }
      }
      return null
    },
    [doc.shapes],
  )

  // --- pointer handlers ---
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const { x: umX, y: umY } = pointerToUm(e)
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)

      // Pattern tools (ストライプ/グリッド) are added from their side form;
      // on the canvas they behave like select so the result can be moved.
      const isCreate =
        tool === 'rect' ||
        tool === 'ellipse' ||
        tool === 'line' ||
        tool === 'text'

      if (!isCreate) {
        // resize handle?
        if (selected) {
          const h = hitHandle(umX, umY)
          if (h) {
            dragRef.current = {
              mode: 'resize',
              shapeId: selected.id,
              handle: h,
              startUmX: umX,
              startUmY: umY,
              origin: boundsOf(selected),
            }
            return
          }
        }
        const hit = hitShape(umX, umY)
        if (hit) {
          onSelect(hit.id)
          dragRef.current = {
            mode: 'move',
            shapeId: hit.id,
            startUmX: umX,
            startUmY: umY,
            origin: boundsOf(hit),
          }
        } else {
          onSelect(null)
        }
        return
      }

      // creation tools: start a drag-rect (or click placement for text)
      dragRef.current = {
        mode: 'create',
        shapeId: null,
        startUmX: umX,
        startUmY: umY,
        origin: { x: umX, y: umY, w: 0, h: 0 },
      }
      setPreview({ x: umX, y: umY, w: 0, h: 0 })
    },
    [tool, selected, hitHandle, hitShape, onSelect, pointerToUm],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const { x: umX, y: umY } = pointerToUm(e)
      const dx = umX - drag.startUmX
      const dy = umY - drag.startUmY

      if (drag.mode === 'create') {
        const x = Math.min(drag.startUmX, umX)
        const y = Math.min(drag.startUmY, umY)
        const w = Math.abs(dx)
        const h = Math.abs(dy)
        setPreview({ x, y, w, h })
        return
      }

      if (!drag.shapeId) return
      const shape = doc.shapes.find((s) => s.id === drag.shapeId)
      if (!shape) return

      if (drag.mode === 'move') {
        onUpdate(shape.id, patchFromBox(shape, {
          ...drag.origin,
          x: Math.max(0, drag.origin.x + dx),
          y: Math.max(0, drag.origin.y + dy),
        }))
        return
      }

      if (drag.mode === 'resize' && drag.handle) {
        const b = { ...drag.origin }
        const right = drag.origin.x + drag.origin.w
        const bottom = drag.origin.y + drag.origin.h
        const h = drag.handle
        if (h.includes('w')) {
          b.x = Math.min(drag.origin.x + dx, right - MIN_UM)
          b.w = right - b.x
        }
        if (h.includes('e')) {
          b.w = Math.max(MIN_UM, drag.origin.w + dx)
        }
        if (h.includes('n')) {
          b.y = Math.min(drag.origin.y + dy, bottom - MIN_UM)
          b.h = bottom - b.y
        }
        if (h.includes('s')) {
          b.h = Math.max(MIN_UM, drag.origin.h + dy)
        }
        onUpdate(shape.id, patchFromBox(shape, b))
      }
    },
    [doc.shapes, onUpdate, pointerToUm],
  )

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current
      dragRef.current = null
      ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)

      if (!drag || drag.mode !== 'create') {
        setPreview(null)
        return
      }
      setPreview(null)

      const { x: umX, y: umY } = pointerToUm(e)
      const x = Math.min(drag.startUmX, umX)
      const y = Math.min(drag.startUmY, umY)
      const w = Math.abs(umX - drag.startUmX)
      const h = Math.abs(umY - drag.startUmY)

      const made = createShape(tool, { x, y, w, h }, drag.startUmX, drag.startUmY)
      if (made) {
        onAdd(made)
        onToolChange('select')
      }
    },
    [tool, onAdd, onToolChange, pointerToUm],
  )

  // Delete key removes selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return
      }
      if (selectedId) {
        e.preventDefault()
        onDelete(selectedId)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, onDelete])

  const isCreateTool =
    tool === 'rect' ||
    tool === 'ellipse' ||
    tool === 'line' ||
    tool === 'text'
  const cursor = isCreateTool ? 'crosshair' : 'default'

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div
        ref={wrapRef}
        className="relative min-h-0 w-full flex-1 overflow-hidden"
      >
        {pxW >= 1 && pxH >= 1 && (
          <div
            className="absolute inset-0"
            style={{ display: 'grid', gridTemplateColumns: `${RULER_SIZE}px auto`, gridTemplateRows: `${RULER_SIZE}px auto` }}
          >
            {/* corner */}
            <div className="border-b border-r border-border bg-muted" />
            {/* top ruler */}
            <Ruler
              orientation="horizontal"
              lengthUm={lengthUmX}
              scale={scale}
              pxLength={pxW}
            />
            {/* left ruler */}
            <Ruler
              orientation="vertical"
              lengthUm={lengthUmY}
              scale={scale}
              pxLength={pxH}
            />
            {/* canvas area */}
            <div
              className="relative"
              style={{ width: pxW, height: pxH }}
            >
              <canvas
                ref={canvasRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                className="block touch-none select-none shadow-sm"
                style={{ cursor, width: pxW, height: pxH }}
              />

              {/* SVG overlay for selection + create preview */}
              <svg
                className="pointer-events-none absolute left-0 top-0"
                width={pxW}
                height={pxH}
              >
                {selBox && (
                  <rect
                    x={selBox.x * scale}
                    y={selBox.y * scale}
                    width={selBox.w * scale}
                    height={selBox.h * scale}
                    fill="none"
                    stroke={ACCENT}
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                  />
                )}
                {tool === 'select' &&
                  handles.map((h) => (
                    <rect
                      key={h.id}
                      x={h.x - HANDLE_PX / 2}
                      y={h.y - HANDLE_PX / 2}
                      width={HANDLE_PX}
                      height={HANDLE_PX}
                      fill="#ffffff"
                      stroke={ACCENT}
                      strokeWidth={1.5}
                    />
                  ))}
                {preview && (preview.w > 0 || preview.h > 0) && (
                  <rect
                    x={preview.x * scale}
                    y={preview.y * scale}
                    width={preview.w * scale}
                    height={preview.h * scale}
                    fill="rgba(47,109,240,0.1)"
                    stroke={ACCENT}
                    strokeWidth={1}
                    strokeDasharray="3 2"
                  />
                )}
              </svg>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** Build a shape from the dragged box for the active creation tool. */
function createShape(
  tool: ToolKind,
  box: Box,
  startX: number,
  startY: number,
): Shape | null {
  const w = Math.max(box.w, MIN_UM)
  const h = Math.max(box.h, MIN_UM)

  switch (tool) {
    case 'rect': {
      const shape: RectShape = {
        id: newId('rect-'),
        kind: 'rect',
        x: box.x,
        y: box.y,
        w,
        h,
      }
      return shape
    }
    case 'ellipse': {
      const shape: EllipseShape = {
        id: newId('ell-'),
        kind: 'ellipse',
        x: box.x,
        y: box.y,
        w,
        h,
      }
      return shape
    }
    case 'line': {
      // a thin rect: dominant axis = length, fixed thin width
      const horizontal = box.w >= box.h
      const length = Math.max(horizontal ? box.w : box.h, MIN_UM)
      const thickness = 1
      const shape: RectShape = {
        id: newId('line-'),
        kind: 'rect',
        x: box.x,
        y: box.y,
        w: horizontal ? length : thickness,
        h: horizontal ? thickness : length,
      }
      return shape
    }
    case 'text': {
      const heightUm = box.h > MIN_UM ? box.h : 20
      const shape: TextShape = {
        id: newId('text-'),
        kind: 'text',
        x: startX,
        y: startY,
        text: 'Text',
        heightUm,
      }
      return shape
    }
    case 'lineSpace': {
      const horizontal = box.w >= box.h
      const lengthUm = Math.max(horizontal ? box.w : box.h, 10)
      const shape: LineSpaceShape = {
        id: newId('ls-'),
        kind: 'lineSpace',
        x: box.x,
        y: box.y,
        lineWidthUm: 5,
        spaceUm: 5,
        count: 5,
        orientation: horizontal ? 'vertical' : 'horizontal',
        lengthUm,
      }
      return shape
    }
    default:
      return null
  }
}
