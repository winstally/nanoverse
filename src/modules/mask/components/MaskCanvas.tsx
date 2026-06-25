'use client'

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Calibration } from '@/modules/mask/calibration'
import { MaskDocument } from '@/modules/mask/document'
import {
  EllipseShape,
  GridShape,
  LineSpaceShape,
  MIN_UM,
  newId,
  RectShape,
  Shape,
  TextShape,
} from '@/modules/mask/shape'
import { renderToCanvas } from '@/modules/mask/renderer'
import {
  Box,
  CornerHandle,
  clamp,
  countForSpan,
  framePointsOf,
  MIN_LINE_UM,
  moveShapeBy,
  patternSpan,
  Point,
  pointInShape,
  resizeShapeFromCorner,
  rotateShapeTo,
  rotationOriginOf,
  shapeBounds,
  shapeRotationDeg,
} from '@/modules/mask/geometry'
import { Ruler, RULER_SIZE } from '@/modules/mask/components/Ruler'
import { ToolKind } from '@/modules/mask/components/Toolbar'
import type { ToolDefaults } from '@/modules/mask/tool-defaults'
import { useI18n } from '@/components/app/I18nProvider'

type HandleId = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w' | 'rotate'

interface DragState {
  mode: 'create' | 'move' | 'resize' | 'rotate'
  shapeId: string | null
  handle?: HandleId
  originShape?: Shape
  /** pointer start in µm */
  startUmX: number
  startUmY: number
  /** original box of the shape in µm; local for resize, rendered bounds for move. */
  origin: Box
  rotationOrigin?: Point
  startAngleDeg?: number
  startRotationDeg?: number
}

const HANDLE_PX = 8
const PRIMARY_HANDLE_PX = 10
const ROTATE_HANDLE_OFFSET_PX = 18
/** Below this pointer travel (screen px) a create gesture counts as a click, not a drag. */
const CLICK_PX = 4
/** Selection-chrome accent (mirrors --color-accent). Not part of the mask artifact. */
const ACCENT = '#2f6df0'

interface MaskCanvasProps {
  doc: MaskDocument
  cal: Calibration
  tool: ToolKind
  defaults: ToolDefaults
  selectedId: string | null
  onSelect: (id: string | null) => void
  onAdd: (shape: Shape) => void
  onUpdate: (id: string, patch: Partial<Shape>) => void
  onDelete: (id: string) => void
  onToolChange: (tool: ToolKind) => void
  onViewZoom: (tool: 'zoomIn' | 'zoomOut') => void
  /** Multiplier applied on top of the automatic fit-to-view scale. */
  viewZoom: number
  /** Called once when a move/resize gesture begins, to checkpoint undo history. */
  onBeginEdit?: () => void
}

function useMaskCanvasView({
  doc,
  cal,
  tool,
  defaults,
  selectedId,
  onSelect,
  onAdd,
  onUpdate,
  onDelete,
  onToolChange,
  onViewZoom,
  viewZoom,
  onBeginEdit,
}: MaskCanvasProps) {
  const { t } = useI18n()
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const offscreenRef = useRef<HTMLCanvasElement | null>(null)
  const [viewport, setViewport] = useState({ w: 0, h: 0 })
  const [preview, setPreview] = useState<Box | null>(null)
  const dragRef = useRef<DragState | null>(null)

  // Total µm span of the canvas. Taken from the derived calibration (single
  // geometry authority) so the editor field always matches the exported BMP,
  // even when a stale heightUm sits in the document after an undo.
  const lengthUmX = cal.substrateWUm
  const lengthUmY = cal.substrateHUm

  // Compute fit scale (screen px per µm), preserving the substrate aspect ratio.
  const fitScale = useMemo(() => {
    const availW = Math.max(viewport.w - RULER_SIZE, 1)
    const availH = Math.max(viewport.h - RULER_SIZE, 1)
    if (lengthUmX <= 0 || lengthUmY <= 0) return 1
    return Math.min(availW / lengthUmX, availH / lengthUmY)
  }, [viewport, lengthUmX, lengthUmY])

  const scale = fitScale * viewZoom
  const pxW = lengthUmX * scale
  const pxH = lengthUmY * scale

  // Measure available space. The viewport drives a full canvas re-raster, so we
  // coalesce resize bursts (e.g. the sidebar collapse/expand spring) and only
  // re-rasterize once the size settles — never on every animation frame.
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => setViewport({ w: r.width, h: r.height }), 110)
    })
    ro.observe(el)
    // Initial measure is immediate so the first paint is correctly sized.
    setViewport({ w: el.clientWidth, h: el.clientHeight })
    return () => {
      ro.disconnect()
      if (timer) clearTimeout(timer)
    }
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
  const selFrame = selected ? framePointsOf(selected) : null

  // Handle positions (screen px relative to canvas top-left).
  const handles: { id: HandleId; x: number; y: number }[] = useMemo(() => {
    if (!selected || !selFrame) return []
    const [nw, ne, se, sw] = selFrame
    const origin = rotationOriginOf(selected)
    const vx = ne.x - origin.x
    const vy = ne.y - origin.y
    const len = Math.hypot(vx, vy) || 1
    const rotate = {
      x: ne.x + (vx / len) * (ROTATE_HANDLE_OFFSET_PX / scale),
      y: ne.y + (vy / len) * (ROTATE_HANDLE_OFFSET_PX / scale),
    }
    const screen = (p: Point) => ({ x: p.x * scale, y: p.y * scale })
    return [
      { id: 'nw', ...screen(nw) },
      { id: 'ne', ...screen(ne) },
      { id: 'se', ...screen(se) },
      { id: 'sw', ...screen(sw) },
      { id: 'rotate', ...screen(rotate) },
    ]
  }, [selected, selFrame, scale])

  const hitHandle = useCallback(
    (umX: number, umY: number): HandleId | null => {
      // Handles are painted in array order. When thin shapes collapse handles
      // onto each other, hit-test in reverse paint order so the visible topmost
      // handle is the one that responds.
      for (let i = handles.length - 1; i >= 0; i--) {
        const h = handles[i]
        const hitPx = h.id === 'se' ? PRIMARY_HANDLE_PX : HANDLE_PX
        const tolUm = hitPx / scale
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
        if (pointInShape({ x: umX, y: umY }, doc.shapes[i])) {
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
      if (tool === 'zoomIn' || tool === 'zoomOut') {
        e.preventDefault()
        onViewZoom(tool)
        return
      }

      const { x: umX, y: umY } = pointerToUm(e)
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)

      const isCreate =
        tool === 'rect' ||
        tool === 'ellipse' ||
        tool === 'line' ||
        tool === 'text' ||
        tool === 'lineSpace' ||
        tool === 'grid'

      if (!isCreate) {
        // resize handle?
        if (selected) {
          const h = hitHandle(umX, umY)
          if (h) {
            onBeginEdit?.()
            if (h === 'rotate') {
              const origin = rotationOriginOf(selected)
              dragRef.current = {
                mode: 'rotate',
                shapeId: selected.id,
                handle: h,
                originShape: selected,
                startUmX: umX,
                startUmY: umY,
                origin: shapeBounds(selected),
                rotationOrigin: origin,
                startAngleDeg: Math.atan2(umY - origin.y, umX - origin.x) * 180 / Math.PI,
                startRotationDeg: shapeRotationDeg(selected),
              }
              return
            }
            dragRef.current = {
              mode: 'resize',
              shapeId: selected.id,
              handle: h,
              originShape: selected,
              startUmX: umX,
              startUmY: umY,
              origin: shapeBounds(selected),
            }
            return
          }
        }
        const hit = hitShape(umX, umY)
        if (hit) {
          onSelect(hit.id)
          onBeginEdit?.()
          dragRef.current = {
            mode: 'move',
            shapeId: hit.id,
            originShape: hit,
            startUmX: umX,
            startUmY: umY,
            origin: shapeBounds(hit),
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
    [tool, selected, hitHandle, hitShape, onSelect, pointerToUm, onBeginEdit, onViewZoom],
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
      const originShape = drag.originShape ?? shape

      if (drag.mode === 'move') {
        // Keep the shape's bounding box inside the substrate field.
        const minDx = -drag.origin.x
        const minDy = -drag.origin.y
        const maxDx = lengthUmX - (drag.origin.x + drag.origin.w)
        const maxDy = lengthUmY - (drag.origin.y + drag.origin.h)
        onUpdate(
          shape.id,
          moveShapeBy(
            originShape,
            clamp(dx, minDx, maxDx),
            clamp(dy, minDy, maxDy),
          ),
        )
        return
      }

      if (drag.mode === 'rotate') {
        const origin = drag.rotationOrigin
        if (!origin || drag.startAngleDeg == null || drag.startRotationDeg == null) {
          return
        }
        const angleDeg = Math.atan2(umY - origin.y, umX - origin.x) * 180 / Math.PI
        onUpdate(
          shape.id,
          rotateShapeTo(originShape, drag.startRotationDeg + angleDeg - drag.startAngleDeg),
        )
        return
      }

      if (drag.mode === 'resize' && drag.handle) {
        onUpdate(
          shape.id,
          resizeShapeFromCorner(
            originShape,
            drag.handle as CornerHandle,
            { x: umX, y: umY },
          ),
        )
      }
    },
    [doc.shapes, onUpdate, pointerToUm, lengthUmX, lengthUmY],
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
      const x0 = Math.min(drag.startUmX, umX)
      const y0 = Math.min(drag.startUmY, umY)
      const w0 = Math.abs(umX - drag.startUmX)
      const h0 = Math.abs(umY - drag.startUmY)

      // A negligible drag is treated as a click: place a default-sized shape.
      const isClick = Math.max(w0, h0) * scale < CLICK_PX

      // Keep the dragged box inside the substrate field.
      const x = clamp(x0, 0, lengthUmX)
      const y = clamp(y0, 0, lengthUmY)
      const w = Math.min(w0, lengthUmX - x)
      const h = Math.min(h0, lengthUmY - y)
      const startX = clamp(drag.startUmX, 0, lengthUmX)
      const startY = clamp(drag.startUmY, 0, lengthUmY)

      const made = createShape(
        tool,
        { x, y, w, h },
        startX,
        startY,
        defaults,
        isClick,
        t('mask.text.default'),
      )
      if (made) {
        onAdd(made)
        onToolChange('select')
      }
    },
    [tool, defaults, scale, onAdd, onToolChange, pointerToUm, lengthUmX, lengthUmY, t],
  )

  // Delete key removes selection.
  const handleDeleteKey = useEffectEvent((e: KeyboardEvent) => {
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
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => handleDeleteKey(e)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const isCreateTool =
    tool === 'rect' ||
    tool === 'ellipse' ||
    tool === 'line' ||
    tool === 'text' ||
    tool === 'lineSpace' ||
    tool === 'grid'
  const cursor =
    tool === 'zoomIn'
      ? 'zoom-in'
      : tool === 'zoomOut'
        ? 'zoom-out'
        : isCreateTool
          ? 'crosshair'
          : 'default'
  const selectionPoints = selFrame
    ? selFrame.map((p) => `${p.x * scale},${p.y * scale}`).join(' ')
    : ''

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div
        ref={wrapRef}
        className="relative min-h-0 w-full flex-1 overflow-auto"
      >
        {pxW >= 1 && pxH >= 1 && (
          <div
            className="relative"
            style={{
              display: 'grid',
              gridTemplateColumns: `${RULER_SIZE}px ${pxW}px`,
              gridTemplateRows: `${RULER_SIZE}px ${pxH}px`,
              width: RULER_SIZE + pxW,
              height: RULER_SIZE + pxH,
            }}
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
                className="block touch-none select-none"
                style={{ cursor, width: pxW, height: pxH }}
              />

              {/* SVG overlay for selection + create preview */}
              <svg
                className="pointer-events-none absolute left-0 top-0"
                width={pxW}
                height={pxH}
              >
                {selFrame && (
                  <polygon
                    points={selectionPoints}
                    fill="none"
                    stroke={ACCENT}
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                  />
                )}
                {tool === 'select' &&
                  handles.map((h) => {
                    if (h.id === 'rotate') {
                      return (
                      <circle
                        key={h.id}
                        cx={h.x}
                        cy={h.y}
                        r={HANDLE_PX / 2 - 1}
                        fill="#ffffff"
                        stroke={ACCENT}
                        strokeWidth={1.5}
                      />
                      )
                    }
                    const size = h.id === 'se' ? PRIMARY_HANDLE_PX : HANDLE_PX
                    return (
                      <rect
                        key={h.id}
                        x={h.x - size / 2}
                        y={h.y - size / 2}
                        width={size}
                        height={size}
                        fill={h.id === 'se' ? ACCENT : '#ffffff'}
                        stroke={ACCENT}
                        strokeWidth={1.5}
                      />
                    )
                  })}
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

export function MaskCanvas(props: MaskCanvasProps) {
  return useMaskCanvasView(props)
}

/**
 * Build a shape from the create gesture for the active tool. On a click
 * (`isClick`) the shape takes its default size, centred on the click point;
 * otherwise it takes the dragged box.
 */
function createShape(
  tool: ToolKind,
  box: Box,
  startX: number,
  startY: number,
  defaults: ToolDefaults,
  isClick: boolean,
  defaultText: string,
): Shape | null {
  const w = Math.max(box.w, MIN_UM)
  const h = Math.max(box.h, MIN_UM)

  switch (tool) {
    case 'rect': {
      const rw = isClick ? defaults.rect.w : w
      const rh = isClick ? defaults.rect.h : h
      const shape: RectShape = {
        id: newId('rect-'),
        kind: 'rect',
        x: isClick ? Math.max(0, startX - rw / 2) : box.x,
        y: isClick ? Math.max(0, startY - rh / 2) : box.y,
        w: rw,
        h: rh,
      }
      return shape
    }
    case 'ellipse': {
      const ew = isClick ? defaults.ellipse.w : w
      const eh = isClick ? defaults.ellipse.h : h
      const shape: EllipseShape = {
        id: newId('ell-'),
        kind: 'ellipse',
        x: isClick ? Math.max(0, startX - ew / 2) : box.x,
        y: isClick ? Math.max(0, startY - eh / 2) : box.y,
        w: ew,
        h: eh,
      }
      return shape
    }
    case 'line': {
      // a thin rect: dominant axis = length, fixed thin thickness
      if (isClick) {
        // Click: a horizontal line of default length, centred on the click.
        const length = defaults.line.length
        const thickness = defaults.line.thickness
        const shape: RectShape = {
          id: newId('line-'),
          kind: 'rect',
          x: Math.max(0, startX - length / 2),
          y: Math.max(0, startY - thickness / 2),
          w: length,
          h: thickness,
        }
        return shape
      }
      const horizontal = box.w >= box.h
      const length = Math.max(horizontal ? box.w : box.h, MIN_UM)
      const thickness = defaults.line.thickness
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
      const heightUm = isClick || box.h <= MIN_UM ? defaults.text.heightUm : box.h
      const shape: TextShape = {
        id: newId('text-'),
        kind: 'text',
        x: startX,
        y: startY,
        text: defaultText,
        heightUm,
      }
      return shape
    }
    case 'lineSpace': {
      const lineWidthUm = Math.max(MIN_LINE_UM, defaults.lineSpace.lineWidthUm)
      const spaceUm = Math.max(0, defaults.lineSpace.spaceUm)
      const orientation = defaults.lineSpace.orientation
      const count = isClick
        ? Math.max(1, Math.round(defaults.lineSpace.count))
        : countForSpan(
            orientation === 'vertical' ? box.w : box.h,
            lineWidthUm,
            spaceUm,
          )
      const lengthUm = isClick
        ? Math.max(MIN_UM, defaults.lineSpace.lengthUm)
        : Math.max(orientation === 'vertical' ? box.h : box.w, MIN_UM)
      const spanUm = patternSpan(count, lineWidthUm, spaceUm)
      const widthUm = orientation === 'vertical' ? spanUm : lengthUm
      const heightUm = orientation === 'vertical' ? lengthUm : spanUm
      const shape: LineSpaceShape = {
        id: newId('ls-'),
        kind: 'lineSpace',
        x: isClick ? Math.max(0, startX - widthUm / 2) : box.x,
        y: isClick ? Math.max(0, startY - heightUm / 2) : box.y,
        lineWidthUm,
        spaceUm,
        count,
        orientation,
        lengthUm,
      }
      return shape
    }
    case 'grid': {
      const lineWidthUm = Math.max(MIN_LINE_UM, defaults.grid.lineWidthUm)
      const spaceUm = Math.max(0, defaults.grid.spaceUm)
      const cols = isClick
        ? Math.max(1, Math.round(defaults.grid.cols))
        : countForSpan(box.w, lineWidthUm, spaceUm)
      const rows = isClick
        ? Math.max(1, Math.round(defaults.grid.rows))
        : countForSpan(box.h, lineWidthUm, spaceUm)
      const widthUm = patternSpan(cols, lineWidthUm, spaceUm)
      const heightUm = patternSpan(rows, lineWidthUm, spaceUm)
      const shape: GridShape = {
        id: newId('grid-'),
        kind: 'grid',
        x: isClick ? Math.max(0, startX - widthUm / 2) : box.x,
        y: isClick ? Math.max(0, startY - heightUm / 2) : box.y,
        lineWidthUm,
        spaceUm,
        cols,
        rows,
      }
      return shape
    }
    default:
      return null
  }
}
